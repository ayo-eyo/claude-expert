# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

npm-workspaces monorepo for a video-meeting product:

- `apps/backend` — NestJS API
- `apps/frontend` — Next.js (App Router) + HeroUI + Tailwind CSS v4

Each app has its own `CLAUDE.md` with app-specific detail; read this file first for anything that spans both.

## Commands

Run from the repo root (npm workspaces installs/hoists for both apps at once):

```bash
npm install              # installs deps for root + both apps
npm run dev:backend      # nest start --watch, http://localhost:4000
npm run dev:frontend     # next dev, http://localhost:3000
npm run build            # build --workspaces --if-present (both apps)
npm run lint             # lint --workspaces --if-present (both apps)
npm run test             # test --workspaces --if-present (backend jest suite)
npm run format           # prettier --write . across the whole repo
```

To target a single app directly: `npm run <script> -w backend` or `-w frontend` (see each app's `CLAUDE.md`/`package.json` for its full script list, e.g. backend's `test:e2e`, `test:cov`, `test:debug`).

## Cross-app wiring

- Backend listens on port `4000` by default (`PORT` env overrides) and has CORS enabled (`app.enableCors()` in `apps/backend/src/main.ts`) so the frontend on `3000` can call it directly without a proxy.

## Linting & formatting

- **Prettier** is configured once, at the repo root (`.prettierrc.json`, `.prettierignore`), and applies to both apps — there is no per-app Prettier config. Don't add one; edit the root config instead.
- **ESLint** is configured separately per app (`apps/backend/eslint.config.mjs`, `apps/frontend/eslint.config.mjs`) because they use different rule sets (`typescript-eslint` recommendedTypeChecked for Nest vs `eslint-config-next` for Next). Both include `eslint-config-prettier` so ESLint's stylistic rules don't fight Prettier.

## HeroUI v3 — read before trusting general web docs

This repo uses **HeroUI v3** (`@heroui/react` + `@heroui/styles`), which is new enough that most blog posts, and even some HeroUI docs pages, still describe the v2 API. Verified directly against the installed package (`node_modules/@heroui/react/dist/index.d.ts`) and the official `heroui-inc/next-app-template` reference:

- There is **no `HeroUIProvider`** export in v3. Don't add one — it will fail to build. The only provider wired up in `apps/frontend/src/app/providers.tsx` is `next-themes`.
- Components take different props than v2 — e.g. `Button` has no `color` prop, use `variant` instead. Check the `.d.ts` files in `node_modules/@heroui/react/dist/components/` for the real prop shape before assuming a v2-era API.

## Next.js 16 caveat

`apps/frontend` runs Next.js 16, which is newer than most training data and has breaking changes vs. older Next.js conventions. See `apps/frontend/AGENTS.md` (imported into `apps/frontend/CLAUDE.md`) — read the docs under `apps/frontend/node_modules/next/dist/docs/` before writing Next.js-specific code, since `next`'s `node_modules` lives inside the app workspace, not at the repo root.
