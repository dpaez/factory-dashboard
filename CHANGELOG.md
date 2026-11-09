# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- The README leads with the factory sandbox quickstart, how the dashboard connects to the factory, a usage walkthrough and troubleshooting. Contributor detail moved to `docs/development.md` and the release procedure to `docs/releasing.md` (#57).

## [0.2.0] - 2026-11-04

### Added
- The dashboard ships as an sbx mixin kit, `ghcr.io/dpaez/sbx-kit-factory-dashboard`, for the `geut/sbx-shell-pi` factory workload. The Release workflow attaches the app tarball to the GitHub release and pushes the mixin for `linux/amd64` and `linux/arm64` (#62).
- A backlog card whose tracker fails shows an action to take instead of the raw `gh` output, and Retry refreshes the backlog (#65).

### Changed
- The overview, tickets list and ticket detail (`/tickets/[key]`) read only from the factory server API (`FACTORY_API_URL`, `FACTORY_API_TOKEN`). A rejected or missing token shows a configuration error page.

### Removed
- The SQLite reader (`node:sqlite`, drizzle, `DB_URL`), the vendored state schema and the scratch-database test harness.
