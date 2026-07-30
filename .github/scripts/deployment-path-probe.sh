#!/usr/bin/env bash
set -u

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PORT:?DEPLOY_PORT is required}"
: "${DEPLOY_KEY:?DEPLOY_KEY is required}"
: "${MIN_DEPLOY_BPS:=131072}"

ssh_dir="$RUNNER_TEMP/owcs-stats-probe-ssh"
deploy_key="$ssh_dir/deploy_key"
known_hosts="$ssh_dir/known_hosts"
probe_file="$RUNNER_TEMP/owcs-network-probe.bin"
probe_dir="/www/wwwroot/.owcs-stats-probe/current"
remote="$DEPLOY_USER@$DEPLOY_HOST"
speed_bps=0

cleanup_local() {
  rm -rf -- "$ssh_dir" "$probe_file"
}
trap cleanup_local EXIT

write_summary() {
  local ready="$1"
  {
    echo "### Deployment path probe"
    echo
    echo "- Measured upload speed: $speed_bps B/s"
    echo "- Required upload speed: $MIN_DEPLOY_BPS B/s"
    echo "- Deployment ready: $ready"
    echo "- Production directories touched: no"
  } >> "$GITHUB_STEP_SUMMARY"
}

rm -rf -- "$ssh_dir"
install -d -m 700 "$ssh_dir"
printf '%s\n' "$DEPLOY_KEY" > "$deploy_key"
chmod 600 "$deploy_key"
head -c 2097152 /dev/urandom > "$probe_file"

if ! ssh-keyscan -T 20 -p "$DEPLOY_PORT" -H "$DEPLOY_HOST" > "$known_hosts" 2>/dev/null; then
  echo "Unable to read the deployment server host key."
  write_summary false
  exit 1
fi

ssh_args=(
  -i "$deploy_key"
  -p "$DEPLOY_PORT"
  -o "UserKnownHostsFile=$known_hosts"
  -o StrictHostKeyChecking=yes
  -o ConnectTimeout=20
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
)
export RSYNC_RSH="ssh -i $deploy_key -p $DEPLOY_PORT -o UserKnownHostsFile=$known_hosts -o StrictHostKeyChecking=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4"

if ! ssh "${ssh_args[@]}" "$remote" \
  "rm -rf -- '$probe_dir' && mkdir -p '$probe_dir' && command -v rsync && df -h /www/wwwroot && df -i /www/wwwroot"; then
  echo "SSH preflight failed."
  write_summary false
  exit 1
fi

started_at=$(date +%s)
rsync_result=0
rsync \
  --archive \
  --partial \
  --timeout=60 \
  --info=progress2 \
  "$probe_file" \
  "$remote:$probe_dir/" || rsync_result=$?
finished_at=$(date +%s)

ssh "${ssh_args[@]}" "$remote" "rm -rf -- '$probe_dir'" || true

if [ "$rsync_result" -ne 0 ]; then
  echo "The representative upload probe failed with rsync exit code $rsync_result."
  write_summary false
  exit 1
fi

elapsed=$((finished_at - started_at))
if [ "$elapsed" -lt 1 ]; then elapsed=1; fi
speed_bps=$((2097152 / elapsed))

if [ "$speed_bps" -lt "$MIN_DEPLOY_BPS" ]; then
  echo "Upload speed $speed_bps B/s is below the safe threshold $MIN_DEPLOY_BPS B/s."
  write_summary false
  exit 1
fi

echo "Deployment path is healthy enough to continue: $speed_bps B/s."
write_summary true
