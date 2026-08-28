# OWCS Stats production deployment

Pushes to `master` are validated by GitHub Actions, archived with `git archive`,
and streamed over the restricted `owcs-stats-ci` SSH account. The account only
accepts `deploy <40-character Git SHA>` and cannot open an interactive shell.

The server stores immutable releases under `/opt/compose/owcs-stats/releases`,
builds SHA-tagged backend and frontend images, then updates the `source` symlink.
The external MySQL database and `/opt/compose/owcs-stats/secrets/backend.env` are
not included in images or release archives. Failed health checks restore the
previous compose file, environment file, source link, and images.

Required repository secrets:

- `OWCS_STATS_DEPLOY_HOST`
- `OWCS_STATS_DEPLOY_PORT`
- `OWCS_STATS_DEPLOY_USER`
- `OWCS_STATS_DEPLOY_KEY`
- `OWCS_STATS_DEPLOY_KNOWN_HOSTS`
