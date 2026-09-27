# Auto-Fix Policy

## Allowed Without Asking

- Formatter-only changes.
- Lint autofix where the configured command succeeds.
- Import ordering.
- Test snapshot updates only when the project explicitly allows them.
- Documentation typos.

## Requires A Fix Branch Or User Review

- Type errors that need code behavior changes.
- Test failures in product logic.
- UI behavior changes.
- Dependency upgrades.
- Any change spanning more than three files.

## Report Only

- Auth, permission, privacy, payment, billing.
- Secrets and credentials.
- Database migrations.
- Production deployment or infrastructure.
- Data deletion or destructive scripts.
- Ambiguous business logic.

## Verification Rule

Every kept auto-fix must have a before/after check:

```text
failure observed -> minimal patch -> relevant check passes
```

If the check still fails, do not claim the issue was fixed.

