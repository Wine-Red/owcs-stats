# OWCS Stats production deployment

Pushes to `master` validate the frontend and backend, build the frontend once,
and create two immutable Docker images in GitHub Actions. BuildKit caches the
backend npm layer and the Nginx frontend layers between releases. The verified
images are published to GHCR under the exact Git commit SHA.

The restricted deployment account synchronizes a small immutable release
record. A one-day workflow artifact then streams the already-verified images
directly into the Tencent Docker daemon over SSH, avoiding slow cross-border
registry pulls while GHCR remains the durable rollback and migration copy. The
server verifies both embedded revision labels, runs isolated Node and Nginx
checks, and only then switches Compose. A failed transfer never reaches Compose;
a failed health check restores the previous Compose file, environment, source
link, and cached images.

## Persistent state and migration

The following state is outside images and immutable releases:

- The MySQL database selected by `DB_HOST`, `DB_PORT`, and `DB_NAME`
- `/opt/compose/owcs-stats/data/media`
- `/opt/compose/owcs-stats/secrets/backend.env`
- `/opt/compose/owcs-stats/.env` (Compose settings and image references)

`OWCS_MEDIA_DIR` can point both containers at another absolute media directory.
This allows a new server to use a mounted disk or restored backup without
changing application code.

A complete migration consists of a transactionally consistent MySQL dump,
the media directory, `backend.env`, `.env`, and `compose.yaml`. Restore the
database and files on the new host, update only host-specific database/network
values, then run the normal workflow. The workflow streams immutable images and
recreates containers; Node/npm and frontend builds do not run on the new host.
Do not archive `releases`, `ci-upload`, or `.deploy-state` unless deployment
history itself is required.

The image names are supplied through `OWCS_API_IMAGE` and `OWCS_WEB_IMAGE`.
Moving from GHCR to another OCI registry therefore changes only the workflow
image names and registry login, not Compose storage or application settings.

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

No registry credential is stored or sent to the production host during the
normal workflow. The key cannot open an interactive shell; it accepts only
validated `prepare`, `activate-stream`, and registry-fallback `activate`
commands and writes inside the dedicated upload directory. A server-side lock
serializes deployment operations and a 27-minute deadline releases the lock if
a CI connection is lost.
