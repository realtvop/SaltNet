# shared/core

Platform-neutral SaltNet domain logic shared by the web app (`src/`) and the CLI (`cli/`).

Rules:

- No Vue, MDUI, localForage, `import.meta.env`, DOM or `src/` imports. Storage, configuration and
  progress reporting are passed in by the caller; the only side effect core code may have is network access.
  Reading randomness (`globalThis.crypto`) or the clock is not a side effect; new code takes them as
  optional arguments with those globals as the defaults, so tests and the CLI can fix them.
- Internal imports are relative (no `@/` or `@core/` aliases).
- `pnpm check` type-checks this folder with `shared/core/tsconfig.json`, which has no DOM or Node
  types, and ESLint (`saltnet/shared-core-boundary` in `eslint.config.js`) rejects framework imports.
- Tests live next to the modules as `*.test.ts` and are excluded from the DOM-free type check.

Injection points:

- `config.ts` defines `CoreConfig` (endpoints and identifiers). Core code takes the values it needs
  as arguments, falling back to `DEFAULT_CORE_CONFIG`; the web app uses the defaults, the CLI
  overrides them from `config.json` or environment variables.
- `http.ts` defines `FetchLike`, the small slice of `fetch` that core code needs. Callers pass their
  own implementation (timeouts, proxies, mocks); the global `fetch` is the default.
- `integrations/lxns/oauth.ts` takes the random bytes of a PKCE verifier, the SHA-256 digest of its
  challenge and the current time as optional arguments.
- `user/ratingHistory.ts`: `normalizeRatingHistory` takes the current time as an optional argument
  (it is read only when the single entry made from the current rating has no update time).
- Network helpers return a result value for expected failures (for example `fetchSaltMetaMusicList`
  returns `{ ok: false, failure }`) instead of showing messages; the caller decides how to report it.
