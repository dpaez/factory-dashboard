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
## Commit 3408426

- **Author:** Diego Paez <diego@geutstudio.com>
- **Date:** 2026-09-26T17:03:17-03:00
- **Files:** `.chan/code.md`, `.chan/hooks/post-commit`, `.gitignore`, `CHANGELOG.md`, `package.json`, `pnpm-lock.yaml`, `src/lib/components/info-card.svelte`, `src/lib/components/info-cost-card.svelte`, `src/lib/server/client.ts`, `src/routes/+page.svelte`, `vite.config.ts`
- **Original message:** Update: config tweaks, using adapter-node and new build script
- **Tags:** Chore (breaking, confidence 0.55)
- **Analysis:** Switches the SvelteKit deployment target from @sveltejs/adapter-auto to @sveltejs/adapter-node (v5.5.7) and adds a `start` script (`node build`) so the built app can be run as a standalone Node server; vite.config.ts adapter import and comments were updated accordingly, with pnpm-lock changes pulling in rollup/plugin deps required by adapter-node. Database configuration moved from build-time static env (`$env/static/private` DB_URL) to runtime dynamic env (`$env/dynamic/private`) with an explicit runtime guard that throws if DB_URL is missing — DB_URL is now required when the server starts rather than at build time. UI tweaks: info cards width w-72 → w-64, added `$` currency prefix to the cost card value, removed `gap-4` from dashboard grids, and relabeled the tickets card title from 'Tickets' to 'Active'. Also introduces chan tooling artifacts: `.chan/code.md` knowledge base, `.chan/hooks/post-commit` running `chan analyze --auto`, `.chanrc` gitignored, and a Keep-a-Changelog `CHANGELOG.md` with an Unreleased section.
- **Breaking change:** yes
- **Breaking confidence:** 0.55
- **Breaking details:** Replacing adapter-auto with adapter-node changes the build output and deployment model: builds now produce a Node server launched via the new `start` script instead of an auto-detected platform output, so existing deployment CI targeting Vercel/Netlify/other adapter-auto platforms would break. Additionally, DB_URL moved from static (build-time) to dynamic (runtime) env with a hard throw when absent — pipelines that supplied DB_URL only at build time would now fail at runtime.
- **Related code:** package.json (adapter-auto → adapter-node, new start script), vite.config.ts (sveltekit adapter import), src/lib/server/client.ts (static → dynamic env.DB_URL with runtime validation), src/lib/components/info-card.svelte, src/lib/components/info-cost-card.svelte, src/routes/+page.svelte, .chan/code.md, .chan/hooks/post-commit, CHANGELOG.md, .gitignore

