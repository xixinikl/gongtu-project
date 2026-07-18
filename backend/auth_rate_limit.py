"""Small single-process rate limiter for authentication endpoints."""

from __future__ import annotations

from collections import OrderedDict, deque
import hashlib
import ipaddress
import math
import os
from threading import Lock
import time

from fastapi import HTTPException, Request


LOGIN_ACCOUNT_LIMIT = (5, 5 * 60)
LOGIN_SOURCE_LIMIT = (20, 5 * 60)
REGISTER_ACCOUNT_LIMIT = (3, 60 * 60)
REGISTER_SOURCE_LIMIT = (5, 60 * 60)
MAX_BUCKETS = 10_000


class SlidingWindowRateLimiter:
    def __init__(self, *, max_buckets: int = MAX_BUCKETS) -> None:
        self._buckets: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = Lock()
        self._max_buckets = max_buckets

    def consume(self, key: str, *, limit: int, window_seconds: int) -> int | None:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            attempts = self._buckets.pop(key, deque())
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()
            if len(attempts) >= limit:
                self._buckets[key] = attempts
                return max(1, math.ceil(attempts[0] + window_seconds - now))
            attempts.append(now)
            self._buckets[key] = attempts
            while len(self._buckets) > self._max_buckets:
                self._buckets.popitem(last=False)
        return None

    def clear(self, keys: tuple[str, ...]) -> None:
        with self._lock:
            for key in keys:
                self._buckets.pop(key, None)

    def reset(self) -> None:
        """Clear in-memory state; intended for process lifecycle and tests."""
        with self._lock:
            self._buckets.clear()


auth_rate_limiter = SlidingWindowRateLimiter()


def _valid_ip(value: str) -> str | None:
    candidate = value.strip()
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def _trusted_proxy_addresses() -> set[str]:
    configured = os.environ.get("GONTU_TRUSTED_PROXIES", "")
    return {
        address
        for item in configured.split(",")
        if (address := _valid_ip(item)) is not None
    }


def request_source(request: Request) -> str:
    peer = _valid_ip(request.client.host) if request.client else None
    if peer is None:
        return "unknown"

    trusted = _trusted_proxy_addresses()
    if peer not in trusted:
        return peer

    forwarded = request.headers.get("x-forwarded-for", "")
    chain = [address for item in forwarded.split(",") if (address := _valid_ip(item))]
    chain.append(peer)
    while len(chain) > 1 and chain[-1] in trusted:
        chain.pop()
    return chain[-1]


def _account_fingerprint(account: str) -> str:
    normalized = account.strip().casefold().encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()[:24]


def enforce_auth_rate_limit(
    request: Request, *, action: str, account: str
) -> tuple[str, str]:
    if action == "login":
        account_limit, source_limit = LOGIN_ACCOUNT_LIMIT, LOGIN_SOURCE_LIMIT
    elif action == "register":
        account_limit, source_limit = REGISTER_ACCOUNT_LIMIT, REGISTER_SOURCE_LIMIT
    else:
        raise ValueError(f"Unsupported authentication action: {action}")

    source = request_source(request)
    account_key = f"auth:{action}:account:{_account_fingerprint(account)}"
    source_key = f"auth:{action}:source:{source}"
    keys = (account_key, source_key)
    retry_after = 0
    for key, (limit, window_seconds) in zip(
        keys, (account_limit, source_limit), strict=True
    ):
        blocked_for = auth_rate_limiter.consume(
            key, limit=limit, window_seconds=window_seconds
        )
        retry_after = max(retry_after, blocked_for or 0)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many authentication attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    return keys
