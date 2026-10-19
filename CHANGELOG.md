# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- The overview, tickets list and ticket detail (`/tickets/[key]`) read only from the factory server API (`FACTORY_API_URL`, `FACTORY_API_TOKEN`). A rejected or missing token shows a configuration error page.

### Removed
- The SQLite reader (`node:sqlite`, drizzle, `DB_URL`), the vendored state schema and the scratch-database test harness.
