# 公途生产就绪门禁

这条命令是收费上线前的硬门禁，不是建议清单。任一检查失败都会返回非零退出码，并在 JSON 中给出失败项；不得人工忽略后继续发布。

```bash
GONTU_ENV=production \
GONTU_JWT_SECRET='独立随机密钥' \
DEEPSEEK_API_KEY='服务商密钥' \
GONTU_CORS_ORIGINS='https://你的正式域名' \
GONTU_WORKERS=1 \
backend/venv/bin/python tools/production_readiness.py \
  --database /srv/gongtu/data/gongtu.db \
  --backup-dir /安全磁盘/gongtu-backups \
  --restore-drill-database /隔离演练目录/restored.db
```

全部通过时输出 `"ready": true`。当前门禁检查：

- 明确处于 production 模式；
- JWT 不是示例、旧公开值或短密钥；
- 已配置 AI 服务商密钥；
- CORS 仅包含无路径的 HTTPS 正式来源；
- 可信代理列表只包含合法 IP；
- worker 数为 1（当前限流器是单进程内存实现）；
- 正式 SQLite 存在、完整、仅当前系统用户可读写，且至少有一名管理员和审计表；
- 最近 24 小时内存在完整且权限安全的工具备份；
- 独立恢复数据库不是正式库，完整且包含管理员与审计结构。

如果未来改为多 worker，必须先把登录/注册限流迁移到 Redis 或其他共享原子存储，再修改这条门禁。恢复演练步骤见 [DATABASE_BACKUP.md](./DATABASE_BACKUP.md)。
