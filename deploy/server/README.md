# OWCS Stats production deployment

Pushes to `master` validate the frontend and backend, build the frontend once,
and create two immutable Docker images in GitHub Actions. BuildKit caches the
backend npm layer and the Nginx frontend layers between releases. The verified
images are published to GHCR under the exact Git commit SHA.

The restricted deployment account synchronizes a small immutable release
record, then the server uses a workflow-scoped registry credential to pull the
two images. It verifies both embedded revision labels, runs isolated Node and
Nginx checks, and only then switches Compose. Registry credentials live in a
temporary Docker configuration directory and are deleted before activation. A
failed health check restores the previous Compose file, environment, source
link, and already-cached images.

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
values, then run the normal workflow. The workflow pulls immutable images and
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

No long-lived registry credential is stored on the host. The workflow-scoped
credential is removed immediately after each pull. The key cannot open an
interactive shell; it accepts only validated `prepare` and `activate` commands
and writes inside the dedicated upload directory. A server-side lock serializes
deployment operations and a 27-minute deadline releases the lock if a CI
connection is lost.

The image names and registry are GitHub Actions variables. Set
`OWCS_API_IMAGE`, `OWCS_WEB_IMAGE`, and `CONTAINER_REGISTRY`, plus the optional
`CONTAINER_REGISTRY_USERNAME` and `CONTAINER_REGISTRY_TOKEN` secrets, to move
from GHCR to a Tencent TCR instance without changing the application, Compose,
or persistent state. Keeping GHCR as the default is convenient; using TCR in
the same region as production removes the slow first pull during a host
migration.
