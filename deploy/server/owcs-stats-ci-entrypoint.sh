#!/usr/bin/env bash
set -Eeuo pipefail

requested_command="${SSH_ORIGINAL_COMMAND:-}"

if [[ "$requested_command" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
    exec sudo -n /usr/local/sbin/owcs-stats-deploy "${BASH_REMATCH[1]}"
fi

echo "This key only accepts: deploy <40-character Git SHA>" >&2
exit 2
