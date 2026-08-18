#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PORT:?DEPLOY_PORT is required}"
: "${DEPLOY_KEY:?DEPLOY_KEY is required}"
: "${RECOVERY_MODE:?RECOVERY_MODE is required}"

if [[ "$RECOVERY_MODE" != "audit" && "$RECOVERY_MODE" != "recover" ]]; then
  echo "RECOVERY_MODE must be audit or recover."
  exit 2
fi

ssh_dir="$RUNNER_TEMP/owcs-stats-static-recovery-ssh"
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

ssh "${ssh_args[@]}" "$remote" "RECOVERY_MODE='$RECOVERY_MODE' RECOVERY_ID='$GITHUB_RUN_ID' bash -s" <<'REMOTE_RECOVERY'
set -Eeuo pipefail
umask 027

deploy_root="/www/wwwroot"
state_root="$deploy_root/.owcs-stats-deployer"
frontend_live="$deploy_root/owcs-stats"
frontend_previous="$deploy_root/.owcs-stats-frontend-previous"
static_relative="stats/visualize"
static_live="$frontend_live/$static_relative"
static_previous="$frontend_previous/$static_relative"
static_parent="$frontend_live/stats"
static_stage="$static_parent/.visualize-recovery-$RECOVERY_ID"
static_replaced="$static_parent/.visualize-replaced-$RECOVERY_ID"
lock_file="$state_root/deploy.lock"

describe_tree() {
  local label="$1"
  local target="$2"
  echo "[$label] $target"
  if [[ ! -e "$target" ]]; then
    echo 'missing'
    return
  fi
  stat -c 'type=%F mode=%a owner=%U:%G size=%s modified=%y' "$target"
  find "$target" -maxdepth 2 -type f -printf '%P\n' | head -n 20
  echo "files=$(find "$target" -type f | wc -l) bytes=$(du -sb "$target" | cut -f1)"
}

describe_tree live "$static_live"
describe_tree previous "$static_previous"

if [[ "$RECOVERY_MODE" == "audit" ]]; then
  echo '[nginx mappings mentioning stats or visualize]'
  for config in /www/server/panel/vhost/nginx/*.conf /www/server/nginx/conf/*.conf; do
    [[ -f "$config" ]] || continue
    if grep -qE 'stats|visualize' "$config"; then
      echo "config=$config"
      grep -nE 'server_name|location|root |alias |stats|visualize' "$config" | head -n 100
    fi
  done
  echo '[owmini stats configuration block]'
  if [[ -f /www/server/panel/vhost/nginx/owmini.xyz.conf ]]; then
    sed -n '110,225p' /www/server/panel/vhost/nginx/owmini.xyz.conf
  fi
  echo '[candidate static manifests]'
  find /www/wwwroot -maxdepth 6 -type f -path '*/static-data/manifest.json' \
    -printf '%p\n' 2>/dev/null | head -n 50
  echo '[candidate visualize directories]'
  find /www/wwwroot -maxdepth 6 -type d -name visualize -printf '%p\n' 2>/dev/null | head -n 50
  curl --insecure --silent --show-error --output /dev/null --write-out 'origin_status=%{http_code}\n' \
    --resolve owmini.xyz:443:127.0.0.1 https://owmini.xyz/stats/visualize/
  exit 0
fi

test -s "$frontend_live/index.html" || {
  echo 'Live frontend has no index.html; refusing recovery.'
  exit 1
}

install -d -m 700 "$state_root"
exec 9>"$lock_file"
flock -n 9 || {
  echo 'Another production deployment is running.'
  exit 3
}

case "$static_stage" in
  "$static_parent/.visualize-recovery-"*) rm -rf -- "$static_stage" ;;
  *) echo 'Unexpected recovery stage path.'; exit 1 ;;
esac
case "$static_replaced" in
  "$static_parent/.visualize-replaced-"*) rm -rf -- "$static_replaced" ;;
  *) echo 'Unexpected recovery backup path.'; exit 1 ;;
esac

if [[ ! -d "$static_parent" ]]; then
  install -d "$static_parent"
  chown --reference="$frontend_live" "$static_parent"
  chmod --reference="$frontend_live" "$static_parent"
fi
install -d "$static_stage"
cp -p "$frontend_live/index.html" "$static_stage/index.html"
if [[ -e "$static_live" ]]; then
  chown -R --reference="$static_live" "$static_stage"
  chmod --reference="$static_live" "$static_stage"
else
  chown -R --reference="$frontend_live" "$static_stage"
  chmod --reference="$frontend_live" "$static_stage"
fi

test -s "$static_stage/index.html"

if [[ -e "$static_live" ]]; then
  mv "$static_live" "$static_replaced"
fi
if ! mv "$static_stage" "$static_live"; then
  if [[ -e "$static_replaced" ]]; then
    mv "$static_replaced" "$static_live"
  fi
  exit 1
fi

rollback() {
  rm -rf -- "$static_live"
  if [[ -e "$static_replaced" ]]; then
    mv "$static_replaced" "$static_live"
  fi
}

origin_status=$(curl --insecure --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --resolve owmini.xyz:443:127.0.0.1 https://owmini.xyz/stats/visualize/ || true)
if [[ "$origin_status" != "200" ]]; then
  rollback
  echo "Origin health check failed with HTTP $origin_status; restored replaced directory."
  exit 1
fi

public_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  "https://owmini.xyz/stats/visualize/?recovery=$RECOVERY_ID" || true)
if [[ "$public_status" != "200" ]]; then
  rollback
  echo "Public health check failed with HTTP $public_status; restored replaced directory."
  exit 1
fi

echo "Static site recovery completed: origin=$origin_status public=$public_status"
REMOTE_RECOVERY
