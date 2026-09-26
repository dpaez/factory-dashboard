# Code Knowledge Base

<!-- Append-only knowledge base maintained by `chan analyze`. -->
<!-- Do not remove or rewrite existing entries; only append new ones. -->

<!-- chan:context:start -->

## Context

- **Description:** Factory agents dashboard for visualizing activity, blockers, ticket progress, and token usage
- **Usage:** pnpm i; pnpm run dev
- **Runtimes:** node, browser
- **Project types:** application, web app
- **Requirements:** pnpm
- **Notes:** SvelteKit + Svelte 5, TypeScript, Tailwind CSS 4, shadcn-svelte/bits-ui, TanStack Svelte Table, drizzle-orm + drizzle--kit (rc versions) present for sqlite access, Test scripts: vitest (unit, with vitest-browser-svelte/@vitest-browser-playwright) and Playwright (e2e); `pnpm test` runs both, Lint via prettier (`lint`/`format`), type check via svelte-check (`check`), Planned external local server reading factory sqlite db, likely websockets for live updates, Contains .chan/, .chanrc, CHANGELOG.md (chan-style changelog tooling), WIP / active development per README

<!-- chan:context:end -->
