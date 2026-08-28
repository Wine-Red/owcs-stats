# OWCS Stats production deployment

Pushes to `master` are validated and the frontend is built once by GitHub
Actions. A restricted `rsync` session updates a server-side copy of the current
release, so unchanged images are not transferred again. The account only
accepts `prepare`/`activate` commands plus writes inside its upload directory;
it cannot open an interactive shell.

The server stores immutable releases under `/opt/compose/owcs-stats/releases`,
builds a SHA-tagged backend image, packages the validated `dist` in Nginx, then
updates the `source` symlink.
The external MySQL database and `/opt/compose/owcs-stats/secrets/backend.env` are
not included in images or release archives. Failed health checks restore the
previous compose file, environment file, source link, and images.

`stats-openresty-root.conf` and `stats-openresty-proxy-headers.inc` are the
1Panel includes that protect the application with TinyAuth. `/visualize` and
its static assets use the unauthenticated, GET-only `/public-api` prefix; the
normal `/api` prefix stays protected.

Required repository secrets:

- `OWCS_STATS_DEPLOY_HOST`
- `OWCS_STATS_DEPLOY_PORT`
- `OWCS_STATS_DEPLOY_USER`
- `OWCS_STATS_DEPLOY_KEY`
- `OWCS_STATS_DEPLOY_KNOWN_HOSTS`
