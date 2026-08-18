#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PORT:?DEPLOY_PORT is required}"
: "${DEPLOY_KEY:?DEPLOY_KEY is required}"

source_script="deploy/server-pull/owcs-stats-pull-deploy.sh"
ssh_dir="$RUNNER_TEMP/owcs-stats-installer-ssh"
deploy_key="$ssh_dir/deploy_key"
known_hosts="$ssh_dir/known_hosts"
remote="$DEPLOY_USER@$DEPLOY_HOST"
remote_tmp="/tmp/owcs-stats-pull-deploy-$GITHUB_RUN_ID.sh"
install_root="/www/wwwroot/.owcs-stats-deployer"
installed_script="$install_root/bin/deploy.sh"

cleanup() {
  rm -rf -- "$ssh_dir"
}
trap cleanup EXIT

test -s "$source_script"
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
scp_args=(
  -i "$deploy_key"
  -P "$DEPLOY_PORT"
  -o "UserKnownHostsFile=$known_hosts"
  -o StrictHostKeyChecking=yes
  -o ConnectTimeout=20
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
)

scp -q "${scp_args[@]}" "$source_script" "$remote:$remote_tmp"
ssh "${ssh_args[@]}" "$remote" \
  "REMOTE_TMP='$remote_tmp' INSTALL_ROOT='$install_root' INSTALLED_SCRIPT='$installed_script' bash -s" <<'REMOTE_INSTALL'
set -euo pipefail
trap 'rm -f -- "$REMOTE_TMP"' EXIT

install -d -m 700 "$INSTALL_ROOT" "$INSTALL_ROOT/bin" "$INSTALL_ROOT/logs" \
  "$INSTALL_ROOT/npm-cache" "$INSTALL_ROOT/worktrees"
bash -n "$REMOTE_TMP"
install -m 700 "$REMOTE_TMP" "$INSTALLED_SCRIPT.new"
mv -f "$INSTALLED_SCRIPT.new" "$INSTALLED_SCRIPT"
bash -n "$INSTALLED_SCRIPT"
echo "Installed fixed deployment command: $INSTALLED_SCRIPT"
REMOTE_INSTALL
