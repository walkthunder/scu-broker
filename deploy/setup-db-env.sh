#!/bin/bash
set -euo pipefail

DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
JWT=$(openssl rand -hex 32)

mysql -e "CREATE DATABASE IF NOT EXISTS comprix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'comprix'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';"
mysql -e "CREATE USER IF NOT EXISTS 'comprix'@'localhost' IDENTIFIED BY '${DB_PASS}';" || true
# If user exists, reset password (idempotent redeploy)
mysql -e "ALTER USER 'comprix'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';" || true
mysql -e "ALTER USER 'comprix'@'localhost' IDENTIFIED BY '${DB_PASS}';" || true
mysql -e "GRANT ALL PRIVILEGES ON comprix.* TO 'comprix'@'127.0.0.1'; GRANT ALL PRIVILEGES ON comprix.* TO 'comprix'@'localhost'; FLUSH PRIVILEGES;"

echo "=== databases (deployflow must remain) ==="
mysql -N -e "SHOW DATABASES;"

umask 077
cat > /opt/scu-broker/apps/api/.env <<EOF
PORT=3010
NODE_ENV=production
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=comprix
DB_USER=comprix
DB_PASSWORD=${DB_PASS}
JWT_SECRET=${JWT}
JWT_EXPIRES_IN=7d
UPLOAD_DIR=/opt/scu-broker/uploads
PUBLIC_PATH_PREFIX=/scu
SMS_ENABLED=false
ADMIN_PHONE=13800000000
ADMIN_PASSWORD=admin123
ADMIN_NAME=管理员
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@comprix.local
EOF
chmod 600 /opt/scu-broker/apps/api/.env
mkdir -p /opt/scu-broker/uploads

cd /opt/scu-broker/apps/api
npm install --omit=dev --no-fund --no-audit
echo "npm done"
du -sh node_modules
df -h /
free -h
