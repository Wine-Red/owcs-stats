#!/usr/bin/env bash
set -Eeuo pipefail

requested_command="${SSH_ORIGINAL_COMMAND:-}"

if [[ "$requested_command" =~ ^prepare\ ([0-9a-f]{40})\ ([a-z0-9][a-z0-9._:/-]*:[0-9a-f]{40})\ ([a-z0-9][a-z0-9._:/-]*:[0-9a-f]{40})$ ]]; then
    exec sudo -n /usr/local/sbin/owcs-stats-deploy \
        prepare "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
fi

if [[ "$requested_command" =~ ^activate\ ([0-9a-f]{40})\ ([a-z0-9][a-z0-9._:/-]*:[0-9a-f]{40})\ ([a-z0-9][a-z0-9._:/-]*:[0-9a-f]{40})\ ([A-Za-z0-9_.-]+)$ ]]; then
    exec sudo -n /usr/local/sbin/owcs-stats-deploy \
        activate "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" \
        "${BASH_REMATCH[3]}" "${BASH_REMATCH[4]}"
fi

if [[ "$requested_command" == rsync\ --server* ]]; then
    exec /usr/bin/rrsync -wo /opt/compose/owcs-stats/ci-upload
fi

echo "This key only accepts immutable prepare/activate commands and restricted rsync uploads." >&2
exit 2
