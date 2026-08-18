#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

mode="${1:-}"
deploy_sha="${2:-}"

repo_url="https://github.com/Wine-Red/owcs-stats.git"
deploy_root="/www/wwwroot"
state_root="$deploy_root/.owcs-stats-deployer"
repo_dir="$state_root/repo"
worktrees_root="$state_root/worktrees"
npm_cache="$state_root/npm-cache"
logs_root="$state_root/logs"
lock_file="$state_root/deploy.lock"
deployed_sha_file="$state_root/deployed-sha"
frontend_live="$deploy_root/owcs-stats"
backend_live="$deploy_root/owcs-stats-backend"
frontend_previous="$deploy_root/.owcs-stats-frontend-previous"
backend_previous="$deploy_root/.owcs-stats-backend-previous"
supervisorctl="/www/server/panel/pyenv/bin/supervisorctl"

usage() {
  echo "Usage: $0 <dry-run|deploy> <40-character master commit SHA>"
}

if [[ "$mode" != "dry-run" && "$mode" != "deploy" ]]; then
  usage
  exit 2
fi
if [[ ! "$deploy_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid deployment SHA: expected 40 lowercase hexadecimal characters."
  exit 2
fi

install -d -m 700 "$state_root" "$worktrees_root" "$npm_cache" "$logs_root"
exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another OWCS Stats deployment is already running."
  exit 3
fi

log_file="$logs_root/$(date +'%Y%m%d-%H%M%S')-$mode-${deploy_sha:0:12}.log"
exec > >(tee -a "$log_file") 2>&1

echo "Deployment mode: $mode"
echo "Requested SHA: $deploy_sha"
echo "Started at: $(date --iso-8601=seconds)"

for tool in git node npm flock rsync curl nice ionice; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Required tool is missing: $tool"
    exit 1
  }
done
test -x "$supervisorctl" || {
  echo "Supervisor control command is missing: $supervisorctl"
  exit 1
}
test -d "$frontend_live" || {
  echo "Frontend live directory is missing: $frontend_live"
  exit 1
}
test -d "$backend_live" || {
  echo "Backend live directory is missing: $backend_live"
  exit 1
}
test -s "$backend_live/.env" || {
  echo "Backend environment file is missing or empty."
  exit 1
}

if [[ ! -d "$repo_dir/.git" ]]; then
  if [[ -e "$repo_dir" ]]; then
    echo "Repository path exists but is not a Git repository: $repo_dir"
    exit 1
  fi
  echo "Creating the dedicated deployment repository."
  git clone --filter=blob:none --no-checkout "$repo_url" "$repo_dir"
fi

git -C "$repo_dir" remote set-url origin "$repo_url"
git -C "$repo_dir" config http.version HTTP/1.1
fetch_succeeded=false
for attempt in $(seq 1 5); do
  if git -C "$repo_dir" fetch --prune --no-tags origin master; then
    fetch_succeeded=true
    break
  fi
  echo "Git fetch attempt $attempt failed; retrying without touching production."
  sleep $((attempt * 10))
done
if [[ "$fetch_succeeded" != true ]]; then
  echo 'Unable to fetch origin/master after five attempts.'
  exit 1
fi
master_sha=$(git -C "$repo_dir" rev-parse refs/remotes/origin/master)
if [[ "$deploy_sha" != "$master_sha" ]]; then
  echo "Refusing to deploy a non-current master commit."
  echo "Current origin/master: $master_sha"
  exit 1
fi

worktree="$worktrees_root/$deploy_sha"
frontend_stage="$deploy_root/.owcs-stats-frontend-$deploy_sha"
backend_stage="$deploy_root/.owcs-stats-backend-$deploy_sha"
backend_activated=false
frontend_activated=false

safe_remove() {
  local target="$1"
  case "$target" in
    "$worktrees_root"/*|"$deploy_root/.owcs-stats-frontend-"*|"$deploy_root/.owcs-stats-backend-"*|"$frontend_live"|"$backend_live")
      if [[ -e "$target/.user.ini" ]] && command -v chattr >/dev/null 2>&1; then
        chattr -i -- "$target/.user.ini" 2>/dev/null || true
      fi
      rm -rf -- "$target"
      ;;
    *)
      echo "Refusing to remove an unexpected path: $target"
      return 1
      ;;
  esac
}

remove_worktree() {
  if [[ -d "$worktree" ]]; then
    git -C "$repo_dir" worktree remove --force "$worktree" >/dev/null 2>&1 \
      || safe_remove "$worktree"
  fi
  git -C "$repo_dir" worktree prune >/dev/null 2>&1 || true
}

cleanup() {
  local exit_code=$?
  if [[ "$exit_code" -ne 0 ]]; then
    echo "Deployment command failed with exit code $exit_code."
    if [[ "$frontend_activated" == true ]] && declare -F rollback_frontend >/dev/null; then
      rollback_frontend || true
    fi
    if [[ "$backend_activated" == true ]] && declare -F rollback_backend >/dev/null; then
      rollback_backend || true
    fi
    if [[ "$frontend_activated" == false && -e "$frontend_stage" ]]; then
      safe_remove "$frontend_stage" || true
    fi
    if [[ "$backend_activated" == false && -e "$backend_stage" ]]; then
      safe_remove "$backend_stage" || true
    fi
  fi
  remove_worktree
  echo "Finished at: $(date --iso-8601=seconds)"
  exit "$exit_code"
}
trap cleanup EXIT

remove_worktree
git -C "$repo_dir" worktree add --force --detach "$worktree" "$deploy_sha"

export npm_config_cache="$npm_cache"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

run_low_priority() {
  nice -n 10 ionice -c2 -n7 "$@"
}

echo 'Installing frontend dependencies from the local npm cache when possible.'
(
  cd "$worktree"
  run_low_priority npm ci --prefer-offline --no-audit --no-fund
  run_low_priority npm run build
)

echo 'Installing backend production dependencies and running unit tests.'
(
  cd "$worktree/backend"
  run_low_priority npm ci --omit=dev --prefer-offline --no-audit --no-fund
  node --test tests/*.test.js
)

test -s "$worktree/dist/index.html"
test -n "$(find "$worktree/dist/assets" -maxdepth 1 -type f -print -quit)"
test -s "$worktree/backend/package.json"
test -s "$worktree/backend/app.js"
node --check "$worktree/backend/app.js"

if [[ "$mode" == "dry-run" ]]; then
  echo 'Dry run passed. Production directories were not changed.'
  exit 0
fi

safe_remove "$frontend_stage" 2>/dev/null || true
safe_remove "$backend_stage" 2>/dev/null || true
install -d "$frontend_stage" "$backend_stage"
rsync --archive --delete "$worktree/dist/" "$frontend_stage/"
rsync --archive --delete --exclude='.env' "$worktree/backend/" "$backend_stage/"
cp -p "$backend_live/.env" "$backend_stage/.env"

chown -R --reference="$frontend_live" "$frontend_stage"
find "$frontend_stage" -type d -exec chmod 755 {} +
find "$frontend_stage" -type f -exec chmod 644 {} +
chmod --reference="$frontend_live" "$frontend_stage"
chown -R --reference="$backend_live" "$backend_stage"
chmod --reference="$backend_live" "$backend_stage"

test -s "$frontend_stage/index.html"
test -n "$(find "$frontend_stage/assets" -maxdepth 1 -type f -print -quit)"
test -s "$backend_stage/package.json"
test -s "$backend_stage/app.js"
test -s "$backend_stage/.env"
node --check "$backend_stage/app.js"

rollback_backend() {
  echo 'Rolling back backend.'
  if [[ -d "$backend_live" ]]; then
    safe_remove "$backend_live"
  fi
  if [[ -d "$backend_previous" ]]; then
    mv "$backend_previous" "$backend_live"
  fi
  "$supervisorctl" restart owcs-stats-backend:owcs-stats-backend_00 || true
  backend_activated=false
}

rollback_frontend() {
  echo 'Rolling back frontend.'
  if [[ -d "$frontend_live" ]]; then
    safe_remove "$frontend_live"
  fi
  if [[ -d "$frontend_previous" ]]; then
    mv "$frontend_previous" "$frontend_live"
  fi
  frontend_activated=false
}

safe_remove "$backend_previous" 2>/dev/null || true
mv "$backend_live" "$backend_previous"
if ! mv "$backend_stage" "$backend_live"; then
  mv "$backend_previous" "$backend_live"
  echo 'Backend activation failed before restart.'
  exit 1
fi
backend_activated=true

if ! "$supervisorctl" restart owcs-stats-backend:owcs-stats-backend_00; then
  rollback_backend
  echo 'Backend restart failed.'
  exit 1
fi

backend_port=$(sed -n 's/^PORT=//p' "$backend_live/.env" | tail -n 1 | tr -d '\r"' | xargs)
if ! [[ "$backend_port" =~ ^[0-9]+$ ]]; then
  backend_port=3000
fi

backend_healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:$backend_port/api/seasons" \
    | node -e "let body=''; process.stdin.on('data', chunk => body += chunk); process.stdin.on('end', () => { const data = JSON.parse(body); if (!Array.isArray(data)) process.exit(1); });"; then
    backend_healthy=true
    break
  fi
  sleep 2
done
if [[ "$backend_healthy" != true ]]; then
  rollback_backend
  echo 'Backend health check failed.'
  exit 1
fi

safe_remove "$frontend_previous" 2>/dev/null || true
mv "$frontend_live" "$frontend_previous"
if ! mv "$frontend_stage" "$frontend_live"; then
  mv "$frontend_previous" "$frontend_live"
  rollback_backend
  echo 'Frontend activation failed.'
  exit 1
fi
frontend_activated=true

public_healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 10 \
    https://owmini.xyz/api/seasons \
    | node -e "let body=''; process.stdin.on('data', chunk => body += chunk); process.stdin.on('end', () => { const data = JSON.parse(body); if (!Array.isArray(data)) process.exit(1); });"; then
    public_healthy=true
    break
  fi
  sleep 5
done
if [[ "$public_healthy" != true ]]; then
  rollback_frontend
  rollback_backend
  echo 'Public health check failed.'
  exit 1
fi

printf '%s\n' "$deploy_sha" > "$deployed_sha_file.new"
mv "$deployed_sha_file.new" "$deployed_sha_file"

echo "Deployment completed successfully: $deploy_sha"
