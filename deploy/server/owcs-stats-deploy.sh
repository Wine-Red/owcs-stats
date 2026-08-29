#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

mode="${1:-}"
deploy_sha="${2:-}"
api_image="owcs-local/owcs-stats-backend:${deploy_sha}"
web_image="owcs-local/owcs-stats-web:${deploy_sha}"

if [[ "$mode" != "prepare" && "$mode" != "activate" ]]; then
    echo "Invalid deployment mode." >&2
    exit 2
fi
if [[ ! "$deploy_sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Invalid deployment SHA." >&2
    exit 2
fi
deploy_root="/opt/compose/owcs-stats"
releases_root="$deploy_root/releases"
upload_root="$deploy_root/ci-upload"
state_root="$deploy_root/.deploy-state"
build_cache_root="$deploy_root/.build-cache"
global_build_lock="/var/lock/owcs-docker-build.lock"
media_root="$deploy_root/data/media"
lock_file="$state_root/deploy.lock"
prepared_marker="$state_root/prepared-$deploy_sha"
candidate_dir="$upload_root/$deploy_sha"
release_dir="$releases_root/$deploy_sha"
ci_user="owcs-stats-ci"
ci_group=$(id -gn "$ci_user")

for command in awk curl docker flock find grep mktemp readlink rsync sed; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "Required command is missing: $command" >&2
        exit 1
    }
done
docker buildx version >/dev/null 2>&1 || {
    echo "Docker Buildx is required for cached local builds." >&2
    exit 1
}

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

install -d -m 0750 "$releases_root" "$state_root" "$build_cache_root"
install -d -m 0755 -o 1000 -g 1000 "$media_root"
install -d -m 0755 -o 1000 -g 1000 "$media_root/seasons" "$media_root/teams" "$media_root/heroes" "$media_root/maps"
install -d -m 0750 -o 1000 -g 1000 "$media_root/.migration-reports"
install -d -m 0750 -o "$ci_user" -g "$ci_group" "$upload_root"

exec 9>"$lock_file"
if ! flock -n 9; then
    echo "Another OWCS Stats deployment operation is already running." >&2
    exit 3
fi

safe_remove_candidate() {
    case "$candidate_dir" in
        "$upload_root"/[0-9a-f]*)
            rm -rf -- "$candidate_dir"
            ;;
        *)
            echo "Refusing to remove unexpected candidate path: $candidate_dir" >&2
            exit 1
            ;;
    esac
}

if [[ "$mode" == "prepare" ]]; then
    safe_remove_candidate
    install -d -m 0750 -o "$ci_user" -g "$ci_group" "$candidate_dir"

    current_source=$(readlink -f "$deploy_root/source" 2>/dev/null || true)
    if [[ -n "$current_source" && -d "$current_source" && -s "$current_source/.release-sha" ]]; then
        rsync --archive --delete "$current_source/" "$candidate_dir/"
        chown -R "$ci_user:$ci_group" "$candidate_dir"
    fi

    printf '%s\n' "$deploy_sha" >"$prepared_marker"
    chmod 0640 "$prepared_marker"
    echo "OWCS Stats release candidate prepared: $deploy_sha"
    exit 0
fi

test "$(sed -n '1p' "$prepared_marker" 2>/dev/null || true)" = "$deploy_sha" || {
    echo "Release candidate was not prepared." >&2
    exit 1
}
test -d "$candidate_dir" || {
    echo "Uploaded release candidate is missing." >&2
    exit 1
}
test "$(cat "$candidate_dir/.release-sha" 2>/dev/null || true)" = "$deploy_sha" || {
    echo "Uploaded release SHA does not match the requested SHA." >&2
    exit 1
}

if find "$candidate_dir" -type l -print -quit | grep -q .; then
    echo "Release candidate contains symbolic links, which are not accepted." >&2
    exit 1
fi

for required_file in \
    backend/package.json \
    backend/package-lock.json \
    backend/app.js \
    deploy/docker/compose.yaml \
    deploy/docker/Dockerfile.backend \
    deploy/docker/Dockerfile.web \
    deploy/docker/web.nginx.conf \
    deploy/server/owcs-stats-deploy.sh \
    deploy/server/owcs-stats-ci-entrypoint.sh \
    dist/index.html; do
    test -s "$candidate_dir/$required_file" || {
        echo "Release is missing required file: $required_file" >&2
        exit 1
    }
done
test -n "$(find "$candidate_dir/dist/assets" -maxdepth 1 -type f -print -quit)" || {
    echo "Frontend asset bundle is empty." >&2
    exit 1
}

if [[ -e "$release_dir" ]]; then
    test "$(cat "$release_dir/.release-sha" 2>/dev/null || true)" = "$deploy_sha" || {
        echo "Existing release directory does not match the requested SHA." >&2
        exit 1
    }
    safe_remove_candidate
else
    chown -R root:root "$candidate_dir"
    find "$candidate_dir" -type d -exec chmod 0755 {} +
    find "$candidate_dir" -type f -exec chmod 0644 {} +
    chmod 0755 \
        "$candidate_dir/deploy/server/owcs-stats-deploy.sh" \
        "$candidate_dir/deploy/server/owcs-stats-ci-entrypoint.sh"
    mv "$candidate_dir" "$release_dir"
fi

previous_sha=$(cat "$state_root/current-sha" 2>/dev/null || true)
if [[ ! "$previous_sha" =~ ^[0-9a-f]{40}$ ]] || [[ "$previous_sha" == "$deploy_sha" ]]; then
    previous_sha=""
fi

exec 8>"$global_build_lock"
flock 8

build_one_image() {
    local cache_name="$1"
    local dockerfile="$2"
    local image_ref="$3"
    local cache_dir="$build_cache_root/$cache_name"
    local cache_current="$cache_dir/current"
    local cache_next="$cache_dir/next-$deploy_sha"
    local cache_previous="$cache_dir/previous"
    local build_started_at
    local -a cache_from=()

    install -d -m 0750 "$cache_dir"
    case "$cache_next" in
        "$build_cache_root"/*/next-[0-9a-f]*) rm -rf -- "$cache_next" ;;
        *) echo "Refusing unexpected build cache path." >&2; exit 1 ;;
    esac
    if [[ -s "$cache_current/index.json" ]]; then
        cache_from+=(--cache-from "type=local,src=$cache_current")
    fi

    build_started_at=$SECONDS
    docker buildx build \
        --progress=plain \
        --load \
        --file "$release_dir/$dockerfile" \
        --tag "$image_ref" \
        --build-arg "SOURCE_COMMIT=$deploy_sha" \
        "${cache_from[@]}" \
        --cache-to "type=local,dest=$cache_next,mode=max" \
        "$release_dir"
    echo "$image_ref built locally in $((SECONDS - build_started_at)) seconds."

    rm -rf -- "$cache_previous"
    if [[ -d "$cache_current" ]]; then
        mv "$cache_current" "$cache_previous"
    fi
    mv "$cache_next" "$cache_current"
    rm -rf -- "$cache_previous"
}

build_one_image backend deploy/docker/Dockerfile.backend "$api_image"
build_one_image web deploy/docker/Dockerfile.web "$web_image"
flock -u 8

for image_ref in "$api_image" "$web_image"; do
    image_revision=$(docker image inspect \
        --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
        "$image_ref")
    test "$image_revision" = "$deploy_sha" || {
        echo "Image revision label does not match the requested SHA: $image_ref" >&2
        exit 1
    }
done

docker run --rm --network none "$api_image" node --check app.js
docker run --rm --network none --add-host api:127.0.0.1 "$web_image" nginx -t

incoming_dir=$(mktemp -d "$state_root/activate.${deploy_sha}.XXXXXX")
cleanup_activation() {
    case "$incoming_dir" in
        "$state_root"/activate.*)
            rm -rf -- "$incoming_dir"
            ;;
        *)
            echo "Refusing to remove unexpected activation path: $incoming_dir" >&2
            ;;
    esac
}
trap cleanup_activation EXIT

upsert_env() {
    local key="$1"
    local value="$2"
    local file="$3"
    local updated
    updated=$(mktemp "$state_root/env.${deploy_sha}.XXXXXX")
    awk -v key="$key" -v value="$value" '
        BEGIN { replaced = 0 }
        index($0, key "=") == 1 { print key "=" value; replaced = 1; next }
        { print }
        END { if (!replaced) print key "=" value }
    ' "$file" >"$updated"
    cat "$updated" >"$file"
    rm -f -- "$updated"
}

candidate_compose="$incoming_dir/compose.yaml"
candidate_env="$incoming_dir/compose.env"
cp "$release_dir/deploy/docker/compose.yaml" "$candidate_compose"
cp "$deploy_root/.env" "$candidate_env"
upsert_env OWCS_API_IMAGE "$api_image" "$candidate_env"
upsert_env OWCS_WEB_IMAGE "$web_image" "$candidate_env"
upsert_env OWCS_IMAGE_TAG "$deploy_sha" "$candidate_env"
upsert_env OWCS_BACKEND_ENV_FILE './secrets/backend.env' "$candidate_env"

docker compose \
    --project-directory "$deploy_root" \
    --env-file "$candidate_env" \
    --file "$candidate_compose" \
    config --quiet

cp -a "$deploy_root/compose.yaml" "$incoming_dir/compose.previous"
cp -a "$deploy_root/.env" "$incoming_dir/env.previous"
previous_source_target=$(readlink "$deploy_root/source")
activation_started=false

rollback() {
    trap - ERR
    activation_started=false
    set +e
    echo "Deployment failed; restoring the previous release." >&2
    cp -a "$incoming_dir/compose.previous" "$deploy_root/compose.yaml"
    cp -a "$incoming_dir/env.previous" "$deploy_root/.env"
    rollback_link="$deploy_root/.source.rollback.new"
    unlink "$rollback_link" 2>/dev/null || true
    ln -s "$previous_source_target" "$rollback_link"
    mv -Tf "$rollback_link" "$deploy_root/source"
    (cd "$deploy_root" && docker compose up -d --no-build --pull never --remove-orphans) || true
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

activation_started=true
new_source_link="$deploy_root/.source.${deploy_sha}.new"
unlink "$new_source_link" 2>/dev/null || true
ln -s "releases/$deploy_sha" "$new_source_link"
mv -Tf "$new_source_link" "$deploy_root/source"
install -m 0644 "$candidate_compose" "$deploy_root/compose.yaml"
install -m 0600 "$candidate_env" "$deploy_root/.env"

if ! (cd "$deploy_root" && docker compose up -d --no-build --pull never --remove-orphans); then
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
if [[ -n "$previous_sha" ]]; then
    printf '%s\n' "$previous_sha" >"$state_root/previous-sha"
fi
printf '%s\n' "$deploy_sha" >"$state_root/current-sha"
rm -f -- "$prepared_marker"
activation_started=false

previous_api_image=""
previous_web_image=""
if [[ -n "$previous_sha" ]]; then
    previous_api_image="owcs-local/owcs-stats-backend:$previous_sha"
    previous_web_image="owcs-local/owcs-stats-web:$previous_sha"
fi
while IFS= read -r managed_image; do
    case "$managed_image" in
        owcs-local/owcs-stats-backend:*|owcs-local/owcs-stats-web:*|\
        owmini/owcs-stats-backend:*|owmini/owcs-stats-web:*|\
        ghcr.io/wine-red/owcs-stats-backend:*|ghcr.io/wine-red/owcs-stats-web:*) ;;
        *) continue ;;
    esac
    if [[ "$managed_image" == "$api_image" ]] \
        || [[ "$managed_image" == "$web_image" ]] \
        || [[ -n "$previous_api_image" && "$managed_image" == "$previous_api_image" ]] \
        || [[ -n "$previous_web_image" && "$managed_image" == "$previous_web_image" ]]; then
        continue
    fi
    docker image rm "$managed_image" >/dev/null 2>&1 \
        || echo "Could not remove retained/in-use image: $managed_image" >&2
done < <(docker image ls --format '{{.Repository}}:{{.Tag}}')

if flock -w 60 8; then
    docker buildx prune --force \
        --max-used-space 2gb \
        --reserved-space 512mb || true
    flock -u 8
else
    echo "Skipped BuildKit cache cleanup because another build is active." >&2
fi

echo "OWCS Stats deployment completed successfully: $deploy_sha"
