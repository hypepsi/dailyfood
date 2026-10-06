#!/usr/bin/env bash
# 构建并发布当前代码。每次改完代码后执行：sudo deploy/deploy.sh
set -euo pipefail
cd /opt/loseweight

echo "==> 安装依赖"
npm ci --no-audit --no-fund

echo "==> 测试"
npm run typecheck
npm test

echo "==> 构建"
# 构建时不需要真实数据，指向临时目录，避免 root 在数据目录里留下文件
DATA_DIR="$(mktemp -d)" npm run build
mkdir -p .next/cache
chown -R loseweight:loseweight .next/cache

echo "==> 重启（启动时自动执行数据库迁移）"
systemctl restart loseweight

echo "==> 健康检查"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "部署成功"
    exit 0
  fi
  sleep 1
done
echo "应用没有正常启动，查看日志：journalctl -u loseweight -n 50" >&2
exit 1
