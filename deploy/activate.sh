#!/bin/bash
set -euo pipefail

# Patch computx.conf: insert /scu locations before first "location / {" or "location /console"
CONF=/etc/nginx/conf.d/computx.conf
MARKER='# —— scu-broker (CompriX) ——'

if grep -q "$MARKER" "$CONF"; then
  echo "scu locations already present, skip insert"
else
  SNIP=/opt/scu-broker/deploy/nginx-scu.snippet.conf
  python3 - <<'PY'
from pathlib import Path
conf_path = Path("/etc/nginx/conf.d/computx.conf")
snip = Path("/opt/scu-broker/deploy/nginx-scu.snippet.conf").read_text()
# drop comment header lines that are file-level notes outside server
lines = []
for line in snip.splitlines():
    if line.startswith("# CompriX") or line.startswith("# 且必须") or line.startswith("# 勿改"):
        continue
    lines.append(line)
snip_body = "\n".join(lines).rstrip() + "\n\n"
text = conf_path.read_text()
needle = "    location /console/api/ {"
if needle not in text:
    needle = "    location / {"
idx = text.find(needle)
if idx < 0:
    raise SystemExit("cannot find insertion point in computx.conf")
text = text[:idx] + snip_body + text[idx:]
conf_path.write_text(text)
print("inserted scu locations before:", needle.strip())
PY
fi

nginx -t
systemctl reload nginx
echo "nginx reloaded OK"

# systemd unit
cp /opt/scu-broker/deploy/scu-api.service /etc/systemd/system/scu-api.service
systemctl daemon-reload

cd /opt/scu-broker/apps/api
# 首次/幂等种子（findOrCreate），不碰其他库
node scripts/seed.js

systemctl enable --now scu-api
sleep 2
systemctl --no-pager status scu-api | head -20
curl -sS http://127.0.0.1:3010/api/health
echo
curl -sS -o /dev/null -w "local /scu/ -> %{http_code}\n" -H "Host: computx.webinfra.cloud" http://127.0.0.1/scu/
curl -sS -o /dev/null -w "local /scu/api/health -> %{http_code}\n" -H "Host: computx.webinfra.cloud" http://127.0.0.1/scu/api/health
curl -sS -o /dev/null -w "local / (dify) -> %{http_code}\n" -H "Host: computx.webinfra.cloud" http://127.0.0.1/
curl -sS http://127.0.0.1/scu/api/health -H "Host: computx.webinfra.cloud"
echo
free -h
df -h /
docker ps --format '{{.Names}} {{.Status}}' | head -15
