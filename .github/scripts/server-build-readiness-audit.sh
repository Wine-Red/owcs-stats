#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PORT:?DEPLOY_PORT is required}"
: "${DEPLOY_KEY:?DEPLOY_KEY is required}"

ssh_dir="$RUNNER_TEMP/owcs-stats-audit-ssh"
deploy_key="$ssh_dir/deploy_key"
known_hosts="$ssh_dir/known_hosts"
remote="$DEPLOY_USER@$DEPLOY_HOST"

cleanup() {
  rm -rf -- "$ssh_dir"
}
trap cleanup EXIT

install -d -m 700 "$ssh_dir"
printf '%s\n' "$DEPLOY_KEY" > "$deploy_key"
chmod 600 "$deploy_key"
ssh-keyscan -T 20 -p "$DEPLOY_PORT" -H "$DEPLOY_HOST" > "$known_hosts" 2>/dev/null

ssh_args=(
  -i "$deploy_key"
  -p "$DEPLOY_PORT"
  -o "UserKnownHostsFile=$known_hosts"
  -o StrictHostKeyChecking=yes
  -o ConnectTimeout=20
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
)

ssh "${ssh_args[@]}" "$remote" 'bash -s' <<'REMOTE_AUDIT'
set -u

echo '=== identity ==='
id
uname -a

echo '=== resources ==='
command -v nproc >/dev/null 2>&1 && nproc || true
command -v free >/dev/null 2>&1 && free -h || true
command -v swapon >/dev/null 2>&1 && swapon --show || true
uptime || true
df -h /www/wwwroot
df -i /www/wwwroot

echo '=== build tools ==='
for tool in git node npm flock rsync curl systemctl; do
  path=$(command -v "$tool" 2>/dev/null || true)
  printf '%-10s %s\n' "$tool" "${path:-missing}"
done
git --version 2>/dev/null || true
node --version 2>/dev/null || true
npm --version 2>/dev/null || true

echo '=== production paths ==='
for path in /www/wwwroot /www/wwwroot/owcs-stats /www/wwwroot/owcs-stats-backend; do
  if [ -e "$path" ]; then
    stat -c '%A %U %G %s %n' "$path"
    test -r "$path" && echo "readable $path" || echo "not-readable $path"
    test -w "$path" && echo "writable $path" || echo "not-writable $path"
  else
    echo "missing $path"
  fi
done
du -sh /www/wwwroot/owcs-stats /www/wwwroot/owcs-stats-backend 2>/dev/null || true
test -s /www/wwwroot/owcs-stats-backend/.env \
  && echo 'backend-env present' \
  || echo 'backend-env missing-or-empty'

echo '=== backend supervisor ==='
supervisorctl=/www/server/panel/pyenv/bin/supervisorctl
if [ -x "$supervisorctl" ]; then
  "$supervisorctl" status owcs-stats-backend:owcs-stats-backend_00 || true
else
  echo 'supervisorctl missing'
fi

echo '=== outbound connectivity ==='
git_started=$(date +%s)
git ls-remote https://github.com/Wine-Red/owcs-stats.git refs/heads/master
git_finished=$(date +%s)
echo "git-ls-remote-seconds=$((git_finished - git_started))"
curl --fail --silent --show-error --location --max-time 20 \
  --output /dev/null --write-out 'npm-registry-http=%{http_code} total-seconds=%{time_total}\n' \
  https://registry.npmjs.org/
REMOTE_AUDIT
