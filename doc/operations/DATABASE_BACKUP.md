# 公途 SQLite 备份与恢复演练

本工具使用 SQLite 官方在线备份接口读取运行中的 WAL 数据库，完成后立即执行 `PRAGMA integrity_check`。备份文件权限固定为 `0600`。

## 创建备份

```bash
backend/venv/bin/python tools/gontu_db.py backup \
  --source backend/data.db \
  --output-dir /安全磁盘/gongtu-backups \
  --retain 14
```

也可省略 `--source`，此时读取 `GONTU_DB_PATH`，再回退到 `backend/data.db`。定时任务必须检查命令退出码；非零表示备份没有成功，不得当作可恢复副本。

## 验证现有备份

```bash
backend/venv/bin/python tools/gontu_db.py verify \
  --database /安全磁盘/gongtu-backups/gontu-时间.sqlite3
```

## 恢复演练

恢复命令只写入不存在的新路径；目标已存在时会拒绝，绝不覆盖正式库。

```bash
backend/venv/bin/python tools/gontu_db.py restore \
  --backup /安全磁盘/gongtu-backups/gontu-时间.sqlite3 \
  --destination /临时演练目录/restored.db
```

然后用临时 `GONTU_DB_PATH=/临时演练目录/restored.db` 启动隔离服务，核对管理员、用户数、学习记录和审计流水。确认后关闭隔离服务并保留演练记录。

## 上线停止条件

- 只有同一块硬盘上的副本不算可靠备份；至少再同步一份到受控的另一块磁盘或加密对象存储。
- 最近一次已验证备份超过 24 小时，停止发布。
- 从未完成“恢复到新路径”的演练，停止收费上线。
- 备份目录可被其他系统用户读取，停止备份并先修正权限。
