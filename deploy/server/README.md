# OWCS Stats production deployment

Pushes to `master` validate the frontend and backend and build the production
frontend in GitHub Actions. The restricted deployment account synchronizes the
validated bundle and immutable source release to Tencent. The server then
builds two commit-tagged images locally with persistent BuildKit caches under
`/opt/compose/owcs-stats/.build-cache`.

The server verifies both embedded revision labels, runs isolated Node and Nginx
checks, and only then switches Compose. No registry account or cross-border
image pull is involved. A failed build leaves the running release untouched; a
failed health check restores the previous Compose file, environment, source
link, and locally cached images.

## Persistent state and migration

The following state is outside images and immutable releases:

- The MySQL database selected by `DB_HOST`, `DB_PORT`, and `DB_NAME`
- `/opt/compose/owcs-stats/data/media`
- `/opt/compose/owcs-stats/secrets/backend.env`
- `/opt/compose/owcs-stats/.env` (Compose settings and image references)

`OWCS_MEDIA_DIR` can point both containers at another absolute media directory.
This allows a new server to use a mounted disk or restored backup without
changing application code.

A complete migration consists of a transactionally consistent MySQL dump, the
media directory, `backend.env`, `.env`, and `compose.yaml`. Restore the database
and files on the new host, update only host-specific database/network values,
then run the normal workflow. The first deployment on a new host rebuilds the
images; later deployments reuse dependency layers. Copy `.build-cache` only if
you want the first post-migration build to be warm. Do not archive `releases`,
`ci-upload`, or `.deploy-state` unless deployment history itself is required.

## Proxy and deployment access

`stats-openresty-root.conf` and `stats-openresty-proxy-headers.inc` are the
1Panel includes that protect the application with TinyAuth. `/visualize` and
its static assets use the unauthenticated, GET-only `/public-api` prefix; the
normal `/api` prefix stays protected.

The `auth-openresty-*` includes proxy TinyAuth itself. The cookie migration
include clears host-only cookies created before shared-subdomain sessions were
enabled, preventing `/continue` redirect loops without deleting valid shared
sessions.

Required repository secrets:

- `OWCS_STATS_DEPLOY_HOST`
- `OWCS_STATS_DEPLOY_PORT`
- `OWCS_STATS_DEPLOY_USER`
- `OWCS_STATS_DEPLOY_KEY`
- `OWCS_STATS_DEPLOY_KNOWN_HOSTS`

No registry credential is required. The key cannot open an interactive shell;
it accepts only validated `prepare` and `activate` commands and writes inside
the dedicated upload directory. A server-side lock serializes deployment
operations and a 37-minute deadline releases the lock if a CI connection is
lost. Dependency changes and the first build on a new server may be slower;
normal source-only releases reuse the local npm and image layers.
