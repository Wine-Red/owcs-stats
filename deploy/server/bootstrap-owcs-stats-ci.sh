#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

bootstrap_dir="${1:-}"
case "$bootstrap_dir" in
    /tmp/owcs-stats-bootstrap-*) ;;
    *) echo "Unexpected bootstrap path." >&2; exit 2 ;;
esac

deploy_root="/opt/compose/owcs-stats"
ci_user="owcs-stats-ci"
ci_home="/home/owcs-stats-ci"

for file in owcs-stats-deploy.sh owcs-stats-ci-entrypoint.sh compose.yaml id_ed25519.pub; do
    test -s "$bootstrap_dir/$file"
done
bash -n "$bootstrap_dir/owcs-stats-deploy.sh"
bash -n "$bootstrap_dir/owcs-stats-ci-entrypoint.sh"

install -m 0755 "$bootstrap_dir/owcs-stats-deploy.sh" /usr/local/sbin/owcs-stats-deploy
install -m 0755 "$bootstrap_dir/owcs-stats-ci-entrypoint.sh" /usr/local/bin/owcs-stats-ci-entrypoint
install -m 0644 "$bootstrap_dir/compose.yaml" "$deploy_root/compose.yaml"

current_api_image=$(docker inspect --format '{{.Config.Image}}' owcs-stats-backend)
image_tag=${current_api_image##*:}
if [[ ! "$image_tag" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "Unexpected current image tag." >&2
    exit 1
fi

env_tmp=$(mktemp "$deploy_root/.env.new.XXXXXX")
printf '%s\n' \
    "OWCS_IMAGE_TAG=$image_tag" \
    'OWCS_SOURCE_DIR=./source' \
    'OWCS_BACKEND_ENV_FILE=./secrets/backend.env' >"$env_tmp"
chmod 0600 "$env_tmp"
chown root:root "$env_tmp"
mv "$env_tmp" "$deploy_root/.env"

docker compose \
    --project-directory "$deploy_root" \
    --env-file "$deploy_root/.env" \
    --file "$deploy_root/compose.yaml" \
    config --quiet

if ! id "$ci_user" >/dev/null 2>&1; then
    useradd --create-home --home-dir "$ci_home" --shell /bin/bash "$ci_user"
fi
usermod --lock "$ci_user"
ci_group=$(id -gn "$ci_user")
install -d -m 0750 -o "$ci_user" -g "$ci_group" "$ci_home"
install -d -m 0700 -o "$ci_user" -g "$ci_group" "$ci_home/.ssh"

public_key=$(<"$bootstrap_dir/id_ed25519.pub")
if [[ ! "$public_key" =~ ^ssh-ed25519\  ]]; then
    echo "Unexpected deploy public key format." >&2
    exit 1
fi
authorized_keys_tmp=$(mktemp "$ci_home/.ssh/authorized_keys.new.XXXXXX")
printf 'restrict,command="/usr/local/bin/owcs-stats-ci-entrypoint" %s\n' "$public_key" >"$authorized_keys_tmp"
chmod 0600 "$authorized_keys_tmp"
chown "$ci_user:$ci_group" "$authorized_keys_tmp"
mv "$authorized_keys_tmp" "$ci_home/.ssh/authorized_keys"

sudoers_tmp=$(mktemp /etc/sudoers.d/owcs-stats-ci.new.XXXXXX)
printf '%s\n' 'owcs-stats-ci ALL=(root) NOPASSWD: /usr/local/sbin/owcs-stats-deploy *' >"$sudoers_tmp"
chmod 0440 "$sudoers_tmp"
visudo -cf "$sudoers_tmp" >/dev/null
mv "$sudoers_tmp" /etc/sudoers.d/owcs-stats-ci

echo "OWCS Stats CI bootstrap completed for image tag: $image_tag"
