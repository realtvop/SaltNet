# Repository Guidelines

## Keeping This Guide Current

Treat `AGENTS.md` as living project documentation. Whenever a change adds, removes, renames, or reorganizes modules, commands, tests, deployment paths, architecture boundaries, or contribution requirements, update this guide in the same commit or pull request. Review referenced paths and commands before merging so the file remains a reliable quick index to the current codebase.

## Project Structure & Module Organization

SaltNet is a two-package pnpm workspace:

- The root package is the Vue 3/Vite PWA. `src/main.ts` bootstraps Vue, Pinia, MDUI, and the router; `src/App.vue` is the application shell.
- `src/pages/` contains route-level views. Route declarations and browser-history behavior live in `src/components/app/router.ts`.
- `src/stores/` owns global Pinia state, currently including router layout and dialog-history coordination.
- `src/components/data/` contains domain logic: `music/` for the loaded chart metadata (IndexedDB cache and Vue state around the shared SaltMeta fetch), `chart/` for score/rating UI and calculations plus the songs-page query helpers (`songsQuery.ts`: ordering, category filtering, search, grouping and statistics as pure functions), `kaleidxscope/` for the songs-page overview component backed by the shared `ScoreSection` (its gate data lives in `shared/core/kaleidxscope/`), `user/` for profiles, updates, backups, rating history, and the IndexedDB-backed per-chart score event history, and `collection/` for the IndexedDB cache and Vue arrays around the shared LXNS collection mapping, shared collection visuals, combined requirement/progress display, collection dialogs, reusable collection-progress evaluation, and the reactive wrapper (`relatedCollections.ts`) around the shared reverse-association index used by ChartInfo.
- `src/components/integrations/` contains external-service adapters for Diving Fish, LXNS, Nearcade, SaltNet, and asset loading. Keep service-specific API types and token logic inside the relevant folder.
- `shared/core/` holds platform-neutral domain logic shared by the web app and the CLI. It must not
  depend on Vue, MDUI, localForage, `import.meta.env`, the DOM, or anything under `src/`; its own
  imports are relative, and web code imports it through the `@core/*` alias. `pnpm check` type-checks
  it with `shared/core/tsconfig.json` (no DOM or Node types) and the `saltnet/shared-core-boundary`
  block in `eslint.config.js` rejects framework imports. See `shared/core/README.md`.
    - Current contents: `mai/` (rank, combo and sync enums), `music/` (types, SaltMeta conversion and
      fetching, cached-data restoration, `MusicSort` order, and the precomputed simplified/traditional,
      pinyin and romaji search index), `config.ts`/`http.ts` (`CoreConfig` and the injectable
      `FetchLike`), `chart/` (difficulty, chart identity,
      recent-change ordering), `course/` (dan-course definitions and ordered chart matching),
      `kaleidxscope/` (CN gate conditions, life calendars, draw pools), `collection/` (collection
      types, LXNS data mapping and validation, static characters and partners, version-plate
      requirement/progress evaluation, the music-to-collection reverse index builder),
      `user/inGame.ts` (in-game user types), and
      `integrations/` (`diving-fish/type.ts`, `lxns/type.ts`, and the public `lxns/fetchCollection.ts`).
- `src/components/rendering/` is the frontend rendering client. Reusable B50 payload, image, font, and download-filename logic lives in `shared/rendering/` and is consumed by both packages.
- `render-service/` is the Cloudflare Worker/Vercel image-rendering package. `src/worker.ts` is the Worker entry, `tests/` contains its Vitest suite, and both root and package-level `api/render/[...path].ts` files adapt the shared HTTP handler for Vercel deployments.

Static assets belong in `public/`; structured source assets belong in `src/assets/`. Utility and generated-data scripts live in `script/`. Do not edit generated `dist/` files or local `.wrangler/` state.

## Architecture & Navigation Index

Start feature tracing at the route in `src/components/app/router.ts`, then follow the page into its data module or integration adapter. Production uses hash history while development uses HTML5 history; dialog navigation is coordinated between `src/stores/dialog.ts` and `src/stores/router.ts`. For B50 image issues, inspect `src/components/rendering/takumiB50.tsx`, `shared/rendering/`, then `render-service/src/http.tsx`. For music-data updates and search indexing, check `shared/core/music/saltmeta.ts`, `shared/core/music/fetch.ts`, `src/components/data/music/musicApi.ts` (the web wrapper that reports failures), `src/components/data/music/index.ts` (cache and Vue state), and `shared/core/music/search.ts`. For songs-page ordering, category filtering, position indexes, text search, grouping and statistics, inspect the pure functions in `src/components/data/chart/songsQuery.ts`; `src/pages/songs.vue` only passes its reactive state to them. For dan-course data or its songs-page category, inspect `shared/core/course/` and `src/pages/songs.vue`. For KALEIDXSCOPE gate data or its songs-page category, inspect `shared/core/kaleidxscope/`, `src/components/data/kaleidxscope/`, and `src/pages/songs.vue`; life timestamps are stored with the CN UTC+8 offset. For collection or version-plate data, trace `shared/core/integrations/lxns/fetchCollection.ts` (via the web wrapper `src/components/integrations/lxns/fetchCollection.ts`), `shared/core/collection/map.ts`, `src/components/data/collection/index.ts` (cache and Vue state), then `src/pages/collections.vue` or `src/pages/songs.vue`. Version-plate tabs combine adjacent plates with identical score requirements into compact labels such as `熊華極` (sharing the category suffix once) through `getVersionPlateTabs` in `shared/core/collection/versionPlate.ts`, retaining the first plate as the selection value. Broader data-shape notes are documented in `docs/component-data-types.md`.

Bottom navigation spacing is derived from `env(safe-area-inset-bottom, 0px)` in `src/style.css`.
Keep overlays aligned with `--nav-bar-height` and `--nav-bar-padding-bottom` instead of adding
fixed iOS standalone offsets. `index.html` retains `viewport-fit=contain` for browser-managed
screen-edge insets.

Dialogs add same-URL browser-history entries under `history.state.__saltnetDialog`. Closed,
unmounted, or reload-stale dialog entries are skipped during `popstate`/initial reconciliation so
they cannot become empty navigation stops. Register every MDUI function dialog with
`markDialogOpen`/`markDialogClosed`; custom dialogs containing nested MDUI components must use
`.self` lifecycle listeners.

LXNS OAuth callbacks are captured and removed from the URL in `oauthSession.ts` before router
history initialization. Pending authorizations use expiring, state-keyed local storage records
and stable user UIDs; user writes are awaited through `shared.persistUsers()` before navigation
and completion. `LXNSOAuthDialog.vue` handles retries and manual callback-link transfer back to
the originating PWA when a browser uses isolated storage. Never exchange a code without its
matching local transaction and PKCE verifier. Token endpoints accept flat OAuth responses as
well as the legacy API envelope. Startup callback dialogs wait for
`dialogStore.waitForInitialHistory()` so restored dialog entries cannot close the new dialog.

## Build, Test, and Development Commands

Install all workspace dependencies with `pnpm install`. From the repository root:

- `pnpm dev` starts the frontend Vite server.
- `pnpm check` runs Vue/TypeScript checks, the DOM-free `shared/core` type check, and verifies Prettier formatting.
- `pnpm lint` runs ESLint across the repository. Violations that predate the CLI work are frozen in
  `eslint-suppressions.json` (ESLint bulk suppressions), so only new violations fail. After fixing
  old ones, run `pnpm exec eslint . --prune-suppressions` to shrink that file; when moving a file
  that has suppressed violations, move its entry along with it.
- `pnpm build` type-checks, builds the frontend, and generates build metadata.
- `pnpm preview` serves the production frontend build locally.
- `pnpm --filter saltnet-render-service dev` starts the Worker with Wrangler.
- `pnpm --filter saltnet-render-service test` runs its Vitest suite.
- `pnpm --filter saltnet-render-service check` type-checks the service.
- `pnpm test:course` validates the static dan-course snapshot and ordered chart matching.
- `pnpm test:kaleidxscope` validates the gate, noise-stage, and final-sequence snapshot, life-phase boundaries, and chart matching. Unconfirmed life calendars remain empty unless explicitly requested as estimates; the noise calendar uses a labeled three-day estimate from October 1 at 07:00 UTC+8.
- `pnpm test:collection-index` runs focused tests for collection caching, initialization, the
  LXNS collection fetch and mapping, static character/partner data, the ChartInfo reverse
  association index (core builder and web wrapper), and version-plate tab merging.
- `pnpm test:score-history` validates score-change detection, IndexedDB history, generations, and
  user-backup compatibility.
- `pnpm test:recent` validates the recent charts tab ordering, score change timestamp sorting, and limits.
- `pnpm test:music-search` validates music search transliteration, script variants, and metadata indexing.
- `pnpm test:music-data` validates SaltMeta fetching (success, HTTP, version and network failures) and restoration of cached music data.
- `pnpm test:build-info` verifies that version timestamps ignore documentation-only and
  formatting-only commits.
- `pnpm test:oauth` validates callback cleanup, authorization recovery, user identity targeting,
  token response compatibility, refresh-token handling, serialized durable user writes, and
  initial dialog-history reconciliation.

## Coding Style & Naming Conventions

Use TypeScript and Vue single-file components. Prettier enforces four-space indentation, double quotes, semicolons, 100-character lines, and LF endings; use `pnpm pret:fix` for formatting. ESLint uses the Antfu Vue/TypeScript configuration. Keep Vue block order as `script`, `template`, `style`; use kebab-case component names in templates. Name components in PascalCase (`ChartInfo.vue`), composables with `use...`, and variables/functions in camelCase.

## Testing Guidelines

Vitest tests live in `render-service/tests/` and alongside focused frontend data modules, using
`*.test.ts` or `*.test.tsx`. The build metadata script has a Node test at
`script/generateBuildInfo.test.cjs`. Add focused regression cases alongside the affected service,
frontend module, or script code. No coverage threshold is enforced.
Frontend changes must at minimum pass `pnpm check`, `pnpm lint`, and `pnpm build`; manually
exercise affected routes and browser back/forward behavior for UI or dialog changes.

## Commit & Pull Request Guidelines

Follow the repository's Conventional Commit style, such as `feat: add reversed song tab setting`, `fix(render): cache full B50 fonts`, or `style(chart): refine spacing`. Keep commits narrowly scoped. Pull requests should explain behavior changes, link relevant issues, list validation commands, and include before/after screenshots for visible UI work. Review AI-generated code for readability and disclose the tool and model used, as required by the README.

## Security & Configuration

Never commit API keys, tokens, or local Wrangler state. Keep deployment-specific values in environment configuration and document any newly required variables in the relevant package.
