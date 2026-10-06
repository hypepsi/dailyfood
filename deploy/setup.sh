#!/usr/bin/env bash
# 在一台全新的 Ubuntu 24.04 上准备运行环境。可以重复执行。
# 用法：sudo deploy/setup.sh lw.example.com
set -euo pipefail

DOMAIN="${1:?用法: deploy/setup.sh <域名>}"
APP_DIR=/opt/loseweight
DATA_DIR=/var/lib/loseweight
ENV_FILE=/etc/loseweight/env
export DEBIAN_FRONTEND=noninteractive

echo "==> swap（内存小的机器构建时需要）"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Node.js 24、Caddy、sqlite3"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
fi
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
fi
apt-get update -qq
# build-essential：better-sqlite3 没有可用预编译包时需要本地编译
apt-get install -y -qq nodejs caddy sqlite3 build-essential

echo "==> 防火墙"
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

echo "==> 服务用户与目录"
id loseweight >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin loseweight
mkdir -p "$DATA_DIR" /etc/loseweight
chown loseweight:loseweight "$DATA_DIR" && chmod 750 "$DATA_DIR"
chmod 700 /etc/loseweight

echo "==> 环境变量文件"
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  echo "已创建 $ENV_FILE，请填入 OPENAI_API_KEY"
fi
set_env() { grep -q "^$1=" "$ENV_FILE" && sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE" || echo "$1=$2" >> "$ENV_FILE"; }
set_env DATA_DIR "$DATA_DIR"
set_env APP_ORIGIN "https://$DOMAIN"
chmod 600 "$ENV_FILE"

echo "==> Caddy（自动 HTTPS）"
sed "s|{\$LW_DOMAIN}|$DOMAIN|" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable caddy && systemctl reload caddy || systemctl restart caddy

echo "==> systemd 服务与定时任务"
cp "$APP_DIR"/deploy/loseweight.service "$APP_DIR"/deploy/loseweight-maintenance.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable loseweight.service loseweight-maintenance.timer
systemctl start loseweight-maintenance.timer

echo "完成。接下来执行 deploy/deploy.sh 构建并启动应用。"
