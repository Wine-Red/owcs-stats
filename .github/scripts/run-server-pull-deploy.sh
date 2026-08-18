#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PORT:?DEPLOY_PORT is required}"
: "${DEPLOY_KEY:?DEPLOY_KEY is required}"
: "${DEPLOY_MODE:?DEPLOY_MODE is required}"
: "${DEPLOY_SHA:?DEPLOY_SHA is required}"

if [[ "$DEPLOY_MODE" != "dry-run" && "$DEPLOY_MODE" != "deploy" ]]; then
  echo "Invalid deployment mode: $DEPLOY_MODE"
  exit 2
fi
if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'DEPLOY_SHA must be a 40-character lowercase Git SHA.'
  exit 2
fi

ssh_dir="$RUNNER_TEMP/owcs-stats-runner-ssh"
deploy_key="$ssh_dir/deploy_key"
known_hosts="$ssh_dir/known_hosts"
remote="$DEPLOY_USER@$DEPLOY_HOST"
installed_script="/www/wwwroot/.owcs-stats-deployer/bin/deploy.sh"

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

ssh "${ssh_args[@]}" "$remote" \
  "test -x '$installed_script' && '$installed_script' '$DEPLOY_MODE' '$DEPLOY_SHA'"
