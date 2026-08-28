#!/usr/bin/env bash
set -Eeuo pipefail

requested_command="${SSH_ORIGINAL_COMMAND:-}"

if [[ "$requested_command" =~ ^(prepare|activate)\ ([0-9a-f]{40})$ ]]; then
    exec sudo -n /usr/local/sbin/owcs-stats-deploy "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
fi

if [[ "$requested_command" == rsync\ --server* ]]; then
    exec /usr/bin/rrsync -wo /opt/compose/owcs-stats/ci-upload
fi

echo "This key only accepts prepare/activate deployment commands and restricted rsync uploads." >&2
exit 2
