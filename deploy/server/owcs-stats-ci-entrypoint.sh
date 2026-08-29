#!/usr/bin/env bash
set -Eeuo pipefail

requested_command="${SSH_ORIGINAL_COMMAND:-}"

if [[ "$requested_command" =~ ^prepare\ ([0-9a-f]{40})$ ]]; then
    exec sudo -n /usr/local/sbin/owcs-stats-deploy \
        prepare "${BASH_REMATCH[1]}"
fi

if [[ "$requested_command" =~ ^activate\ ([0-9a-f]{40})$ ]]; then
    exec timeout --foreground --signal=TERM --kill-after=30s 37m \
        sudo -n /usr/local/sbin/owcs-stats-deploy \
        activate "${BASH_REMATCH[1]}"
fi

if [[ "$requested_command" == rsync\ --server* ]]; then
    exec /usr/bin/rrsync -wo /opt/compose/owcs-stats/ci-upload
fi

echo "This key only accepts immutable local-build prepare/activate commands and restricted rsync uploads." >&2
exit 2
