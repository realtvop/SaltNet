# Repository Guidelines

## Keeping This Guide Current

Treat `AGENTS.md` as living project documentation. Whenever a change adds, removes, renames, or reorganizes modules, commands, tests, deployment paths, architecture boundaries, or contribution requirements, update this guide in the same commit or pull request. Review referenced paths and commands before merging so the file remains a reliable quick index to the current codebase.

## Project Structure & Module Organization

SaltNet is a two-package pnpm workspace:

- The root package is the Vue 3/Vite PWA. `src/main.ts` bootstraps Vue, Pinia, MDUI, and the router; `src/App.vue` is the application shell.
- `src/pages/` contains route-level views. Route declarations and browser-history behavior live in `src/components/app/router.ts`.
- `src/stores/` owns global Pinia state, currently including router layout and dialog-history coordination.
- `src/components/data/` contains domain logic: `music/` for chart metadata, `chart/` for score/rating UI and calculations, `user/` for profiles, updates, backups, and rating history, and `collection/` for plate/collection definitions.
- `src/components/integrations/` contains external-service adapters for Diving Fish, LXNS, Nearcade, SaltNet, and asset loading. Keep service-specific API types and token logic inside the relevant folder.
- `src/components/rendering/` is the frontend rendering client. Reusable B50 payload, image, and font logic lives in `shared/rendering/` and is consumed by both packages.
- `render-service/` is the Cloudflare Worker/Vercel image-rendering package. `src/worker.ts` is the Worker entry, `tests/` contains its Vitest suite, and both root and package-level `api/render/[...path].ts` files adapt the shared HTTP handler for Vercel deployments.

Static assets belong in `public/`; structured source assets belong in `src/assets/`. Utility and generated-data scripts live in `script/`. Do not edit generated `dist/` files or local `.wrangler/` state.

## Architecture & Navigation Index

Start feature tracing at the route in `src/components/app/router.ts`, then follow the page into its data module or integration adapter. Production uses hash history while development uses HTML5 history; dialog navigation is coordinated between `src/stores/dialog.ts` and `src/stores/router.ts`. For B50 image issues, inspect `src/components/rendering/takumiB50.tsx`, `shared/rendering/`, then `render-service/src/http.tsx`. For music-data updates, check `src/components/data/music/saltmeta.ts`, `public/charts.json`, and `script/updateChartsInfo.cjs`. Broader data-shape notes are documented in `docs/component-data-types.md`.

## Build, Test, and Development Commands

Install all workspace dependencies with `pnpm install`. From the repository root:

- `pnpm dev` starts the frontend Vite server.
- `pnpm check` runs Vue/TypeScript checks and verifies Prettier formatting.
- `pnpm lint` runs ESLint across the repository.
- `pnpm build` type-checks, builds the frontend, and generates build metadata.
- `pnpm preview` serves the production frontend build locally.
- `pnpm --filter saltnet-render-service dev` starts the Worker with Wrangler.
- `pnpm --filter saltnet-render-service test` runs its Vitest suite.
- `pnpm --filter saltnet-render-service check` type-checks the service.

## Coding Style & Naming Conventions

Use TypeScript and Vue single-file components. Prettier enforces four-space indentation, double quotes, semicolons, 100-character lines, and LF endings; use `pnpm pret:fix` for formatting. ESLint uses the Antfu Vue/TypeScript configuration. Keep Vue block order as `script`, `template`, `style`; use kebab-case component names in templates. Name components in PascalCase (`ChartInfo.vue`), composables with `use...`, and variables/functions in camelCase.

## Testing Guidelines

Vitest tests currently live in `render-service/tests/` and use `*.test.ts` or `*.test.tsx`. Add focused regression cases for payload parsing, HTTP behavior, fonts, or templates alongside the affected service code. No coverage threshold is enforced. Frontend changes must at minimum pass `pnpm check`, `pnpm lint`, and `pnpm build`; manually exercise affected routes and browser back/forward behavior for UI or dialog changes.

## Commit & Pull Request Guidelines

Follow the repository's Conventional Commit style, such as `feat: add reversed song tab setting`, `fix(render): cache full B50 fonts`, or `style(chart): refine spacing`. Keep commits narrowly scoped. Pull requests should explain behavior changes, link relevant issues, list validation commands, and include before/after screenshots for visible UI work. Review AI-generated code for readability and disclose the tool and model used, as required by the README.

## Security & Configuration

Never commit API keys, tokens, or local Wrangler state. Keep deployment-specific values in environment configuration and document any newly required variables in the relevant package.
