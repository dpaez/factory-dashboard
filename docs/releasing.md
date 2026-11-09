# Releasing

The dashboard ships as an sbx v3 **mixin** kit, `ghcr.io/dpaez/sbx-kit-factory-dashboard:<version>`, added with `--kit` to the [sbx-shell-pi](https://github.com/geut/sbx-shell-pi) factory workload `ghcr.io/geut/sbx-shell-pi:node-24-factory`. It is a mixin because a set has no Dockerfile and can only list published kits, so the dashboard's files need their own kit. sbx-shell-pi may later publish a set (the factory workload plus this mixin) as one image. The reference may move to `ghcr.io/geut` later.

## The kit

The kit lives in [`kit/factory-dashboard/`](../kit/factory-dashboard/). It requires `node >= 24` and [`io.github.geut/pi-factory >= 1`](https://github.com/geut/sbx-shell-pi#factory-contract), which the factory workload provides. It needs sbx 0.47 or newer, because the factory workload declares `long-running@1`.

It relies on that [factory contract](https://github.com/geut/sbx-shell-pi#factory-contract): `factory-up` starts `factory serve` on container port `7731` (`0.0.0.0`) and writes `.factory/dashboard.env` (mode `0600`) with `FACTORY_API_URL` and an `act` `FACTORY_API_TOKEN` for the `dashboard` client.

A background lifecycle startup hook runs `/usr/local/bin/factory-dashboard` on every boot, beside Herdr. Herdr stays the entrypoint. The dashboard listens on container port `7732` (`HOST=0.0.0.0`), published as `factory-dashboard`, and is restarted if it exits. Its log is `~/.local/state/factory-dashboard/dashboard.log`.

## Release

Put the version on `main`, then create a `v*` tag on that commit. The tag must equal `v` plus the `version` default in [`kit/factory-dashboard/factory-dashboard.yaml`](../kit/factory-dashboard/factory-dashboard.yaml). Pushing the tag does not publish. On `main`, run the [Release workflow](../.github/workflows/release.yml) and enter the tag.

The workflow checks that the tag points at a commit on `main` and matches that version, runs lint, typecheck, and tests, builds the app, and checks that `build/` imports nothing outside Node. It attaches `factory-dashboard-<version>.tgz` and `factory-dashboard-<version>.tgz.sha256` to the GitHub release, then pushes `ghcr.io/dpaez/sbx-kit-factory-dashboard:<version>` for `linux/amd64` and `linux/arm64`. There is no `latest` tag. After the first push, set the GHCR package to public so `sbx` can pull it without credentials.

After a release, update the version in the README quickstart and in the [sbx-shell-pi README](https://github.com/geut/sbx-shell-pi#2-create-the-sandbox).

## Try a kit change

To try a kit change against an existing release, run this on the host from the dashboard repository. The installed dashboard is still the release named in the kit descriptor. A local kit directory needs a `docker-container` Buildx builder, or the containerd image store:

```bash
sbx run --name factory ghcr.io/geut/sbx-shell-pi:node-24-factory /path/to/project \
  --kit ./kit/factory-dashboard
```

The kit set is fixed when the sandbox is created, so changing it means creating a new sandbox.
