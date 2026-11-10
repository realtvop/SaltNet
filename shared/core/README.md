# shared/core

Platform-neutral SaltNet domain logic shared by the web app (`src/`) and the CLI (`cli/`).

Rules:

- No Vue, MDUI, localForage, `import.meta.env`, DOM or `src/` imports. Storage, configuration and
  progress reporting are passed in by the caller; the only side effect core code may have is network access.
- Internal imports are relative (no `@/` or `@core/` aliases).
- `pnpm check` type-checks this folder with `shared/core/tsconfig.json`, which has no DOM or Node
  types, and ESLint (`saltnet/shared-core-boundary` in `eslint.config.js`) rejects framework imports.
- Tests live next to the modules as `*.test.ts` and are excluded from the DOM-free type check.
