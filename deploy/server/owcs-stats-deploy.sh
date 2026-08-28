#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

deploy_sha="${1:-}"
if [[ ! "$deploy_sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Invalid deployment SHA." >&2
    exit 2
fi

deploy_root="/opt/compose/owcs-stats"
releases_root="$deploy_root/releases"
state_root="$deploy_root/.deploy-state"
lock_file="$state_root/deploy.lock"
image_tag="${deploy_sha}-deploy1"
api_image="owmini/owcs-stats-backend:$image_tag"
web_image="owmini/owcs-stats-web:$image_tag"

for command in awk curl docker flock find grep mktemp tar; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "Required command is missing: $command" >&2
        exit 1
    }
done

test -s "$deploy_root/secrets/backend.env" || {
    echo "Backend environment file is missing." >&2
    exit 1
}
test -s "$deploy_root/compose.yaml" || {
    echo "Bootstrap compose file is missing." >&2
    exit 1
}
test -s "$deploy_root/.env" || {
    echo "Bootstrap compose environment is missing." >&2
    exit 1
}

install -d -m 0750 "$releases_root" "$state_root"
exec 9>"$lock_file"
if ! flock -n 9; then
    echo "Another OWCS Stats deployment is already running." >&2
    exit 3
fi

incoming_dir=$(mktemp -d "$state_root/incoming.${deploy_sha}.XXXXXX")
cleanup() {
    case "$incoming_dir" in
        "$state_root"/incoming.*)
            rm -rf -- "$incoming_dir"
            ;;
        *)
            echo "Refusing to remove unexpected temporary path: $incoming_dir" >&2
            ;;
    esac
}
trap cleanup EXIT

archive="$incoming_dir/release.tar.gz"
cat >"$archive"
test -s "$archive"

if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    echo "Release archive contains an unsafe path." >&2
    exit 1
fi

staging_dir="$incoming_dir/source"
install -d -m 0750 "$staging_dir"
tar -xzf "$archive" -C "$staging_dir"

if find "$staging_dir" -type l -print -quit | grep -q .; then
    echo "Release archive contains symbolic links, which are not accepted." >&2
    exit 1
fi

for required_file in \
    package.json \
    package-lock.json \
    backend/package.json \
    backend/package-lock.json \
    deploy/docker/compose.yaml \
    deploy/docker/Dockerfile.backend \
    deploy/docker/Dockerfile.web \
    deploy/docker/web.nginx.conf \
    deploy/server/owcs-stats-deploy.sh \
    deploy/server/owcs-stats-ci-entrypoint.sh; do
    test -s "$staging_dir/$required_file" || {
        echo "Release is missing required file: $required_file" >&2
        exit 1
    }
done

release_dir="$releases_root/$deploy_sha"
if [[ -e "$release_dir" ]]; then
    test "$(cat "$release_dir/.release-sha" 2>/dev/null || true)" = "$deploy_sha" || {
        echo "Existing release directory does not match the requested SHA." >&2
        exit 1
    }
else
    printf '%s\n' "$deploy_sha" >"$staging_dir/.release-sha"
    mv "$staging_dir" "$release_dir"
fi

echo "Building immutable backend image: $api_image"
docker build \
    --build-arg "SOURCE_COMMIT=$deploy_sha" \
    --file "$release_dir/deploy/docker/Dockerfile.backend" \
    --tag "$api_image" \
    "$release_dir"

echo "Building immutable frontend image: $web_image"
docker build \
    --build-arg "SOURCE_COMMIT=$deploy_sha" \
    --build-arg "VITE_BASE_PATH=/" \
    --file "$release_dir/deploy/docker/Dockerfile.web" \
    --tag "$web_image" \
    "$release_dir"

docker run --rm --network none "$api_image" node --check app.js
docker run --rm --network none "$web_image" nginx -t

candidate_compose="$incoming_dir/compose.yaml"
candidate_env="$incoming_dir/compose.env"
cp "$release_dir/deploy/docker/compose.yaml" "$candidate_compose"
cat >"$candidate_env" <<EOF
OWCS_IMAGE_TAG=$image_tag
OWCS_SOURCE_DIR=./source
OWCS_BACKEND_ENV_FILE=./secrets/backend.env
EOF

docker compose \
    --project-directory "$deploy_root" \
    --env-file "$candidate_env" \
    --file "$candidate_compose" \
    config --quiet

cp -a "$deploy_root/compose.yaml" "$incoming_dir/compose.previous"
cp -a "$deploy_root/.env" "$incoming_dir/env.previous"

source_was_symlink=false
previous_source_target=""
bootstrap_source=""
activation_started=false

rollback() {
    trap - ERR
    activation_started=false
    set +e
    echo "Deployment failed; restoring the previous release." >&2
    cp -a "$incoming_dir/compose.previous" "$deploy_root/compose.yaml"
    cp -a "$incoming_dir/env.previous" "$deploy_root/.env"

    if [[ "$source_was_symlink" == true ]]; then
        rollback_link="$deploy_root/.source.rollback.new"
        unlink "$rollback_link" 2>/dev/null || true
        ln -s "$previous_source_target" "$rollback_link"
        mv -Tf "$rollback_link" "$deploy_root/source"
    elif [[ -n "$bootstrap_source" && -d "$bootstrap_source" ]]; then
        unlink "$deploy_root/source" 2>/dev/null || true
        mv "$bootstrap_source" "$deploy_root/source"
    fi

    (cd "$deploy_root" && docker compose up -d --no-build --remove-orphans) || true
    set -e
}

on_error() {
    status=$?
    if [[ "$activation_started" == true ]]; then
        rollback
    fi
    exit "$status"
}
trap on_error ERR

if [[ -L "$deploy_root/source" ]]; then
    source_was_symlink=true
    previous_source_target=$(readlink "$deploy_root/source")
elif [[ -d "$deploy_root/source" ]]; then
    bootstrap_source="$state_root/bootstrap-source-$(date +%Y%m%d-%H%M%S)"
    mv "$deploy_root/source" "$bootstrap_source"
else
    echo "Current source path is missing or unsupported." >&2
    exit 1
fi

activation_started=true
new_source_link="$deploy_root/.source.${deploy_sha}.new"
unlink "$new_source_link" 2>/dev/null || true
ln -s "releases/$deploy_sha" "$new_source_link"
mv -Tf "$new_source_link" "$deploy_root/source"
install -m 0644 "$candidate_compose" "$deploy_root/compose.yaml"
install -m 0600 "$candidate_env" "$deploy_root/.env"

if ! (cd "$deploy_root" && docker compose up -d --no-build --remove-orphans); then
    rollback
    exit 1
fi

healthy=false
for _ in $(seq 1 60); do
    api_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' owcs-stats-backend 2>/dev/null || true)
    web_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' owcs-stats-web 2>/dev/null || true)
    if [[ "$api_health" == "healthy" && "$web_health" == "healthy" ]]; then
        healthy=true
        break
    fi
    sleep 3
done

if [[ "$healthy" != true ]] \
    || ! curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8081/health >/dev/null \
    || ! curl --fail --silent --show-error --max-time 30 'http://127.0.0.1:8081/api/matches?page=1&pageSize=1' >/dev/null \
    || ! curl --fail --silent --show-error --max-time 30 'https://stats.owmini.xyz/api/matches?page=1&pageSize=1' >/dev/null; then
    rollback
    exit 1
fi

install -m 0755 "$release_dir/deploy/server/owcs-stats-deploy.sh" /usr/local/sbin/owcs-stats-deploy
install -m 0755 "$release_dir/deploy/server/owcs-stats-ci-entrypoint.sh" /usr/local/bin/owcs-stats-ci-entrypoint
printf '%s\n' "$deploy_sha" >"$state_root/current-sha"
activation_started=false

echo "OWCS Stats deployment completed successfully: $deploy_sha"
