# Repository Guidelines

## Keeping This Guide Current

Treat `AGENTS.md` as living project documentation. Whenever a change adds, removes, renames, or reorganizes modules, commands, tests, deployment paths, architecture boundaries, or contribution requirements, update this guide in the same commit or pull request. Review referenced paths and commands before merging so the file remains a reliable quick index to the current codebase.

## Project Structure & Module Organization

SaltNet is a three-package pnpm workspace:

- The root package is the Vue 3/Vite PWA. `src/main.ts` bootstraps Vue, Pinia, MDUI, and the router; `src/App.vue` is the application shell.
- `src/pages/` contains route-level views. Route declarations and browser-history behavior live in `src/components/app/router.ts`.
- `src/stores/` owns global Pinia state, currently including router layout and dialog-history coordination.
- `src/components/data/` contains domain logic: `music/` for the loaded chart metadata (IndexedDB cache and Vue state around the shared SaltMeta fetch), `chart/` for score/rating UI and calculations (`chart/chartPosition.ts` only reads the songs page's old position cache), `kaleidxscope/` for the songs-page overview component backed by the shared `ScoreSection` (its gate data lives in `shared/core/kaleidxscope/`), `user/` for profiles, updates, backups, rating history, and the IndexedDB-backed per-chart score event history, and `collection/` for the IndexedDB cache and Vue arrays around the shared LXNS collection mapping, shared collection visuals, combined requirement/progress display, collection dialogs, and the reactive wrapper (`relatedCollections.ts`) around the shared reverse-association index used by ChartInfo.
- `src/components/integrations/` contains external-service adapters for Diving Fish, LXNS, Nearcade, SaltNet, and asset loading. Keep service-specific API types and token logic inside the relevant folder.
  SaltNet's `postAPI` and `postAPIJSON` are web wrappers around the shared client that turn its
  `SaltNetError` back into a plain `Error` with the same message.
- `shared/core/` holds platform-neutral domain logic shared by the web app and the CLI. It must not
  depend on Vue, MDUI, localForage, `import.meta.env`, the DOM, or anything under `src/`; its own
  imports are relative, and web code imports it through the `@core/*` alias. `pnpm check` type-checks
  it with `shared/core/tsconfig.json` (no DOM or Node types) and the `saltnet/shared-core-boundary`
  block in `eslint.config.js` rejects framework imports. See `shared/core/README.md`. Current
  contents:
    - `mai/`: rank, combo and sync enums.
    - `music/`: types, SaltMeta conversion and fetching, cached-data restoration, `MusicSort` order,
      and the precomputed simplified/traditional, pinyin and romaji search index (`music/search.ts`; `createMusicSearchVariants` also reports which of the three a normalized text was reached by, and `createMusicSearchIndex` is built from it). `music/duplicates.ts` folds the banquet songs that upstream lists twice into one entry (only the CLI asks for it; the web app keeps both) and `music/fetch.ts` offers the SaltMeta download and the conversion separately as well as together.
    - `config.ts` and `http.ts`: `CoreConfig` and the injectable `FetchLike`.
    - `chart/`: difficulty, chart identity, recent-change ordering, chart position calculation
      (`chart/position.ts`), score lookup
      (`chart/scoreLookup.ts`: finding a chart's score in the per-chart score map and turning it into a
      chart score), DX score stars (`chart/dxScore.ts`) and the rating calculation (`chart/rating/`).
    - `course/`: dan-course definitions and ordered chart matching.
    - `kaleidxscope/`: CN gate conditions, life calendars, draw pools.
    - `collection/`: collection types, LXNS data mapping and validation, static characters and
      partners, collection ownership (`collection/ownership.ts`), scored collection charts
      (`collection/progress.ts`), version-plate requirement/progress evaluation, and the
      music-to-collection reverse index builder.
    - `user/`: `inGame.ts` (in-game user types), `type.ts` (the stored user profile, detailed score
      map, favorites and their helpers), `ratingHistory.ts` (normalizing and appending rating
      history; `normalizeRatingHistory` takes an optional clock), `backup.ts` (the user data backup file: building a v1 backup and reading v0 and v1
      backups, including their score history), `migrateData.ts` (migrating and timestamping updated
      score records and B50 lists, and supplementing record data) and `scoreHistory/`: the score
      history types (`type.ts`), detecting score changes between two score maps (`candidates.ts`),
      building a batch's events (`batch.ts`), the play-count estimate (`estimate.ts`), the display
      helpers (`presentation.ts`) and `userIdentity.ts` (stable user UIDs and detecting a changed
      account identity).
    - `query/`: the songs-page query helpers in `songs.ts` (ordering, category filtering, position
      indexes, grouping and statistics as pure functions), which re-exports the web search in
      `search.ts`: existing matches ranked by exact ID, whole title/alias, name prefix, name
      substring, name pinyin/romaji, artist, charter, then score/status. Equal relevance preserves
      incoming order; transliteration is cached per metadata object and refreshed when text changes.
      `b50.ts` holds the B50 page's query helpers (the record selection for the B50 modes, sorting,
      rating sums and `getB50Gain`, the rise of the normal B50 total if one chart reached a rating:
      its whole rating when its section is not full, which the chart info dialog does not take into
      account), and `chartInfo.ts` holds the chart info dialog's rating calculations (the rating stage
      table and its display modes, and the user's B50 floor the gains are shown against).
    - `fixtures/`: a trimmed real SaltMeta document with a helper that converts it, used as fixed
      test data by every package, plus a trimmed copy of the four LXNS collection lists (`lxns.ts`)
      and a made-up web user backup (`web-backup-v1.json`: two users, fake tokens, four score
      events) that the CLI backup round-trip test (`cli/tests/commands/backupFixture.test.ts`) reads.
    - `integrations/`: `diving-fish/type.ts`, `diving-fish/client.ts` (the player query, the
      records and the upload by Import-Token, and the B50 built from records, with the base URL
      from `CoreConfig` and an injected `fetch`), `diving-fish/convert.ts` (the Diving Fish music
      list and chart score converters), `lxns/type.ts`, the public `lxns/fetchCollection.ts`,
      `lxns/token.ts` (the token endpoint, applying and refreshing an authorization),
      `lxns/oauth.ts` (the storage-free half of the OAuth flow: PKCE, the authorize URL, reading a
      callback link, checking a stored transaction and a callback against it, exchanging the code
      and checking the exchanged token's expiry),
      `lxns/client.ts` (the player API request and the score converters), and `saltnet/client.ts`
      (the SaltNet backend client with the primary and fallback addresses from `CoreConfig`, an
      injected `fetch` and typed errors).
    - `sync/`: score syncing from the game, LXNS and Diving Fish moved out of the update worker:
      source choice, fetching, merging with existing scores, applying a sync update to a user
      (`apply.ts`), progress through a `report` callback, network calls and uploads from the caller.
    - `util/`: `toHalfWidth`.
- `src/components/rendering/` is the frontend rendering client. Reusable B50 payload, image, font, and download-filename logic lives in `shared/rendering/` and is consumed by both packages.
- `render-service/` is the Cloudflare Worker/Vercel image-rendering package. `src/worker.ts` is the Worker entry, `tests/` contains its Vitest suite, and both root and package-level `api/render/[...path].ts` files adapt the shared HTTP handler for Vercel deployments.
- `cli/` is the `saltnet` command-line tool for agents (package `saltnet-cli`, Node 24). It imports
  core through the same `@core/*` alias as the web app. The design is in
  `docs/spark/2026-11-10-saltnet-cli-design.md`.
    - `src/main.ts` is the entry point (it only connects `runCli` in `src/cli.ts` to the real
      process). `build.mjs` bundles it and the parts of `shared/core` it uses into
      `cli/dist/saltnet.mjs` with esbuild (git-ignored; the `bin` entry points at it), and
      `build.mjs --outfile <path>` writes the bundle to a caller-selected path instead. Defaults for
      the backend, render service and LXNS client are read from the web app's `.env` files at build
      time (`build-defaults.mjs`).
    - `src/commands/` holds the typed command registry, the pieces the commands share and one file
      per command; the list of commands is in `index.ts`.
        - `registry.ts` is the single source that argument parsing, `--help`, `schema` and `guide`
          are generated from. An `optional-string` option takes the next word as its value only when
          there is one that does not start with `-`. Every command also declares the JSON Schema of
          its `data` as `dataSchema`, put together with the builders of `src/output/schema.ts` from
          the shapes in `src/catalog/schemas.ts`, and `tests/commands/dataSchemas.test.ts` checks
          what each command prints against it with Ajv, a dev dependency of the package, so a field
          that is added, dropped or retyped without updating the schema fails a test.
        - `describe.ts` has the shared machine-readable option, positional, usage and error
          descriptions; `parse.ts` and `values.ts` are the never-throwing parser, and `help.ts`
          renders help.
        - `schema.ts` (commands, envelopes and public views) and `guide.ts` (the generated Markdown
          guide) are the self-description commands.
        - `listOptions.ts` has the `--limit`/`--offset`/`--fields` options every list command
          shares, and `confirm.ts` the shared `--yes` option and content-bound destructive-operation
          confirmation.
        - `metadata.ts` has the `useMetadata` helper through which a command gets the catalog
          current; `useStoredMetadata` only makes the stored rows current, for `sql`, and
          `METADATA_ERRORS` is the shared public failure list for both.
        - `userScores.ts` resolves the shared `--user` option and adds score meta and warnings.
        - `search.ts` is the `search` command (default `--limit` 10).
        - `song.ts` and `chart.ts` are the `song` and `chart` commands. Both take `--with related`
          through `withRelated.ts`, which fetches the LXNS collections only when it is given, and
          both take `--user`. `chart` always prints the chart info dialog's rating stage table in
          its concise mode as `stages`, empty for a chart without a constant, and `--with` also
          takes `stages` (the full table), `friends` (the dialog's ranking of the local users on
          this chart), `history` (this chart's score events, as `history <chart>` prints them),
          `position` (the chart's place among the charts of its level and its play count) and `all`.
        - `calc.ts` is the `calc` command, the dialog's calculator: the rating and rank for
          `--achievements`, the lowest achievement rate that reaches `--rating`, or the full stage
          table without either. A constant from 1.0 to 15.0 needs no catalog and reads no user,
          while a chart reference is resolved as `chart` resolves it, with `--user`. Every stage
          that `chart` and `calc` print has `gain`, the rise of the selected user's normal B50 total
          if the chart reached that stage, and `calc` with a chart and `--achievements` or
          `--rating` also gives the `gain` of its result.
        - `charts.ts` is the `charts` command. Its filters are `--level`, `--constant`, `--diff`,
          `--version`, `--search`, `--gate`, `--course`, `--plate`, `--collection`, `--fav` (every
          chart of the songs in a local favorite), `--achieved` and `--missing` (each takes one
          minimum rank, `clear`, combo or sync condition; `--missing` also keeps charts without a
          score; next to exactly one `--plate` or `--collection` the condition may be left out, and
          then each chart is judged by that collection's own requirement,
          `checkCollectionChartFinish`), `--recent` (charts whose score has a change time; it also
          makes `recent` the default order) and `--user`. The gate, the course and the favorite are
          resolved before anything is fetched; the collections are fetched only for `--plate` and
          `--collection`. `--sort`, `--asc`, `--desc` and `--group-by` work too, and `--limit` and
          `--offset` apply to each group when grouped; `--stats` counts the whole filtered result,
          or each whole group, before paging. The score filters, orders and groups and `--stats`
          need a user (`requireUserForScores` in `userScores.ts` fails before anything is fetched),
          while a plain `charts` runs without one and prints `score: null`. `--sort gain` orders by
          the rise of the normal B50 total if each chart reached `--target` (a rank or an
          achievement rate from 0 to 101, default `sss+`), adds `gain` to every row and needs a user
          too.
        - `b50.ts` is the `b50` command: the normal, fit, AP, FC, PC and NB modes of the web app's
          B50 page, always two groups, B35 and B15, each paged on its own, with the rating sums of
          the whole groups in the chosen mode. Every chart row adds that mode's `rank`, `rating` and
          `ratingConstant`. It needs a user, PC50 orders by the records' own play counts and warns
          `NO_PLAY_COUNTS` when none is positive, and a user with only the Diving Fish public B50
          has scores for the normal mode only.
        - `rating.ts` is the `rating` command: the selected user's current rating and, with
          `--history`, the history the web app's rating page shows, oldest first with each entry's
          change. A rating that is not a safe integer is null, and history entries that are not
          objects or have no safe-integer rating are left out before the changes are counted. It
          reads no catalog and never goes online.
        - `history.ts` is the `history` command: the stored score events of every chart or of one,
          newest first, with `--since` (an ISO time, or a positive number of days or hours such as
          `7d`), `--all-changes` (without it, events that change only the play count are hidden, as
          in the web app), the shared paging and fields, and `missing`, the counts of events whose
          record cannot be placed in the catalog. `src/catalog/historyView.ts` shapes each event as
          the shared chart row plus its changes.
        - `collection.ts` holds `collection list` (every collection of every kind with `--kind`,
          `--search` and `--owned`/`--no-owned`, each with whether the selected user owns it and its
          `progress` as the web app counts it; with no users it needs only the LXNS collections, no
          catalog, and `owned` and `progress` are null, while with a user it loads the catalog and
          reports the score meta and warnings) and `collection show` (a collection's conditions, its
          `owned` and `progress`, the charts they name as chart rows with `done`, by default only
          the charts not done yet (`--all` lists all of them), `missing` for songs the catalog
          lacks, and `--user`).
        - `course.ts` holds `course list` (static, no catalog needed) and `course show` (a course's
          life rule and its tracks as chart rows in play order, each with its `track` number, plus
          `missing` for tracks the catalog lacks, and `--user`).
        - `kaleidxscope.ts` is the `kaleidxscope` command. The overview of all gates needs no
          catalog and rejects `--user`; with a gate it adds the calendar, key songs and pools and
          accepts `--at`, `--diff` and `--user`.
        - `status.ts` is the `status` command: the data directory, the schema version, and for the
          songs and the collections when each was fetched and whether it is fresh, stale, built by
          another version or missing, plus the upstream songs that were merged, each user's score
          freshness against `scores.staleDays`, and each user's credential state (`credentials`).
          It reads stored raw users (`lxnsAccountIdOf`) and checks LXNS credentials against
          settings `lxns.refreshTokenDays` and `lxns.expiringWarnDays`.
          It adds an `LXNS_EXPIRING` warning naming the user with `syncUserRef` for expiring or
          expired LXNS tokens. It never goes online and never creates the data directory.
        - `config.ts` holds `config list`, `config get`, `config set` and `config unset`: the
          settings as rows with their value, source and default; `set` and `unset` change one entry
          of `config.json`; all four run even when the settings have errors.
        - `sql.ts` is the `sql` command: one SELECT over the public views with `--limit` (default
          1000, at most 10000) and `--fields`. Only the sources the views it names need are made
          current, so a query that names no view needs no catalog and creates nothing. It runs in
          the sandbox described under `src/store/`.
        - `refresh.ts` is the `saltnet refresh` command; the downloads themselves are
          `src/catalog/refresh.ts`.
        - `user.ts` holds `user list`, `show`, `add`, `edit`, `remove` and `default`; removal uses
          the shared content-bound confirmation, refuses while that user's sync runs, and deletes
          that user's credentials under the credentials lock.
        - `bind.ts` holds `user bind` and `user unbind` for `ingame`, `df-token`, `df-name` and
          `lxns`; `user bind ingame` supports `--id` and `--qr -` (GetQRInfo via SaltNet backend
          without retry), `df-token -` validates through Diving Fish records and stores the token
          strictly in `credentials.json`, `df-name` sets the name and is rejected if a token is set,
          and `lxns` starts an offline PKCE authorization or completes it with `--callback -`.
          Identity changes (`hasStrongIdentityChanged`) are refused until P3-15 adds confirmation.
          Unbind removes bindings locally without network, including `lxnsIssuedAt` for LXNS.
          Writes check for an active sync or hold the user's sync lock during LXNS completion.
          Credential modifications take the credentials lock and stage `credentials.json` before
          database transactions that also change credentials.
        - `fav.ts` holds `fav list`, `create`, `rename`, `delete` (content-bound confirmation),
          `add` and `remove`. As in the web app, a favorite holds songs by the music id of their
          side together with the difficulty each was added at, and `charts --fav` lists every chart
          of those songs.
        - `backup.ts` is the backup interchange: `import` decodes the web v0/v1 format, strips
          credentials, refuses while any sync runs, replaces users plus score events, and records
          itself in the sync journal under the credentials lock after content-bound confirmation,
          dropping pending authorizations; `export` restores selected credentials and writes a
          private web-compatible v1 file. The confirmation binds the backup bytes, every replaced
          user in order, which credentials the import would leave (never their values) and the
          options; v0 users get stable uids from the file digest and their position. `export` reads
          users and events in one `Store.read`. Both keep or restore an LXNS authorization only for
          the LXNS account it was stored for.
        - `sync.ts` is the `sync` command: fetches scores from Diving Fish (import token or username
          with backend fallback to public B50, warning `PUBLIC_B50_ONLY`) or LXNS (matching
          authorization) and writes them to SQLite (users, scores, b50_snapshot, rating_history,
          score_events) under the sync lock, records a `sync_runs` journal entry, and reports score
          counts, rating before/after, and up to 20 score changes ordered by rating gain; in-game source
          and uploads are deferred to later steps.
    - `src/guide/` has the hand-written agent rules (`handwritten.ts`) and deterministic
      registry-generated Markdown (`markdown.ts`).
    - `src/output/` turns a command's result into output: the versioned JSON envelope
      (`envelope.ts`, whose history is `ENVELOPE_CHANGES`), the choice between json, tsv and text
      (`format.ts`, `render.ts`, `tsv.ts`, `text.ts`, `table.ts`), `--fields` projection
      (`fields.ts`), paging (`paging.ts`), the builders for the JSON Schemas of `data` (`schema.ts`;
      an object lists every key it has, so a field that is added or dropped without updating its
      schema fails a test) and the warning codes (`warning.ts`).
    - `src/errors.ts` defines `CliError` and the error-code/exit-code table, and `src/toCliError.ts`
      turns anything thrown into a `CliError`.
    - `src/runtime/` resolves the data directory (`SALTNET_HOME`, default `~/.saltnet`) and layers
      every setting from an environment variable, `config.json`, the build defaults and built-in
      defaults.
        - `configRows.ts` shapes the settings as the rows `config list` and `config get` print;
          `configFile.ts` changes one entry of `config.json` for `config set` and `config unset` by
          rewriting the whole file in one step through `files.ts`, which `catalog/snapshots.ts` uses
          too, and leaves a file that is not a JSON object alone.
        - `io.ts` wraps stdout/stderr/stdin and the network (`fetch`) so tests can inject them.
        - `http.ts` gives commands a `fetch` (`ctx.http()`) that validates header characters before
          sending, redacts header values from error messages and causes, adds the User-Agent and a
          deadline (`network.timeoutMs` unless the caller names another timeout setting), retries
          read requests once on connection failures, timeouts, body-read errors or 429/5xx statuses
          when requested, and reports failures as `NETWORK`/`UPSTREAM_ERROR`, a timeout with a `fix`
          that names the setting to raise.
        - `credentials.ts` strictly reads the versioned credential file (users and pending OAuth
          authorizations) with a fix on parse failures, serializes modifications with
          `withCredentialsLock`, prunes expired authorizations, orphaned user entries and LXNS
          authorizations whose user now has another LXNS id in `updateCredentials`, and stages
          mode-0600 whole-file replacements. Each LXNS authorization is stored with the LXNS id it
          was issued for (`lxnsAccountId`) and the time the refresh token was issued (`lxnsIssuedAt`),
          and `matchingLxnsAuthorization` is the one check that an authorization belongs to a
          user's LXNS account. Pending LXNS binds can hold a hash of the submitted code and the
          exchanged token with its issue time. Credential parse errors omit file contents.
    - `src/util/` has small helpers (edit distance and nearest names, name folding, display width,
      command-line splitting and quoting (`splitCommandLine`, `quoteArg`, `joinCommandLine`), times
      with a UTC offset).
    - `src/store/` is the SQLite database, opened lazily through `ctx.store()`.
        - `sqlite.ts` loads `node:sqlite` synchronously without its experimental warning, and
          `store.ts` opens it in WAL mode and offers `transaction` and `read` (several queries
          against one consistent view).
        - `migrations.ts` holds the numbered layout steps tracked by `PRAGMA user_version` with a
          backup into `cache/` first. Migration 4 adds `users` (whose `raw` column keeps each web
          user object without its tokens, so a backup can be exported exactly; the other columns and
          the user tables are copies of parts of it for queries), `scores`, `b50_snapshot`,
          `user_items`, `user_characters`, `rating_history`, and `score_events`; migration 5 adds
          `favorites` and their `favorite_charts`, which stay on this machine and are never part of
          a backup; migration 6 adds `sync_runs`.
        - `locks.ts` holds the expiring named locks, and `errors.ts` maps SQLite failures to CLI
          errors.
        - `sandbox.ts` and `query.ts` are where `sql` runs. `openSandbox` copies only the public
          views a query names, from the database attached read-only, into a throwaway in-memory
          database that an authorizer limits to `SELECT` of those copies, so no base table is
          reachable and the real database is detached before the query is prepared; `runQuery` runs
          exactly one statement there and turns the rows into JSON values, reporting what SQLite
          objects to as `SQL_ERROR`.
    - `src/catalog/` keeps the metadata in that database.
        - `store.ts` replaces the songs, charts and versions built from SaltMeta and the LXNS
          collections (one transaction each; collection kinds are `title`, `icon`, `plate`, `frame`,
          plus `character` and `partner` from `static.ts`).
        - `static.ts` writes the dan courses, characters and partners that ship with the CLI
          whenever their content fingerprint (`staticBuilder()`) differs from the one stored in
          `meta_state` (the KALEIDXSCOPE data stays out of the database).
        - `snapshots.ts` keeps the raw downloads in `cache/`, `load.ts` reads the rows back into the
          structures the web app keeps (`SavedMusicList`, the mapped collections), and `refresh.ts`
          downloads the sources under the `metadata` lock.
        - `ensure.ts` is what a command calls before it reads them: `ensureMetadata` (its first
          half, `ensureStored`, makes the rows current without loading them and is what `sql` calls)
          rebuilds rows built by another CLI version from the `cache/` snapshots, downloads what is
          missing or older than `metadata.maxAgeHours`, falls back to the stored rows with a
          `STALE_METADATA` warning, and honors `--offline` (`OFFLINE_NO_CACHE`). A download that has
          usable stored rows to fall back on gets the short `metadata.timeoutMs`, one with nothing
          to fall back on gets `network.timeoutMs`, and so does every download of `saltnet refresh`.
        - `songs.ts` regroups the loaded music into songs as the commands talk about them (one
          SaltMeta entry with its SD and DX side, `buildSongCatalog`) and indexes them by music id,
          chart key, title and alias (`chartKey` is the one place that writes a chart key).
        - `search.ts` finds songs for a text (by music id, title, alias, pinyin, romaji, artist or
          charter), ranks the hits and reports how each was found (`matchedBy`); the song
          reference's last step reuses it. It also finds charts for `charts --search` (a song found
          only by a charter gives just that charter's charts).
        - `chartQuery.ts` selects the charts for `charts` (every filter optional, all must pass; the
          order is the game's, hardest difficulty first and the newest song first within it).
        - `chartSort.ts` orders charts
          (`--sort default|constant|achievements|rating|playcount|version|recent|gain`, descending
          unless `--asc`). With scores, `default` is the web app's order (played charts first by
          achievement rate, the rest in the game's order) and `recent` breaks ties by achievement
          rate, rating and constant; charts without a value, or of an unknown version, come last;
          equal charts are told apart by chart key, so the order is always the same.
        - `chartGroups.ts` splits them into groups for `--group-by`. The groups come in a fixed
          order, constants and versions from the highest and the newest, levels from the hardest,
          difficulties from BASIC, ranks and combo and sync statuses from the best; charts with no
          constant, or without that score status, make a group whose key is null, last; `--sort`
          only orders the charts inside a group.
        - `chartStats.ts` counts a result for `--stats` (`countChartResultStats`: total, played, SSS
          with SSS+ included, SSS+, FC, AP and FDX, the counts the web app's songs page shows).
        - `chartSets.ts` works out the charts a gate (every grade of the songs of its key condition
          and pools), a course (its tracks in play order), a plate or a collection (the charts its
          requirements name) stand for, as sets of chart keys that a query intersects:
          `chartQuery.ts` takes them as `within`, and `chartSort.ts` takes the play order of a
          course as `order`, which `--sort default` uses in place of the game's order. `listedPools`
          and `gateMusicIds` leave out the pool of scrambled charts, whose song no command counts as
          one the gate asks for.
        - `chartRow.ts` shapes a chart as the commands print it, while `chartScore.ts` adds the
          selected user's score and B50 place (the shared chart row, `constantOf` (the constant a
          chart has; null where the game has none), and the charter, note counts and statistics only
          `chart` adds; unknown values are null).
        - `courseView.ts` shapes a course (`courseInfo`) and its tracks (`courseTracks`) as the
          commands print them, and `gateView.ts` the gate overview, the life calendar and a gate's
          songs (`gateOverview`, `gatePhases`, `gateDetail`, which pick one chart per song like the
          web app does and put songs the catalog lacks in `pending`).
        - `collectionView.ts` shapes a collection as `collection list` prints it (`collectionRow`;
          `collectionDetail` adds its conditions; ownership and progress come from a
          `collectionUserContext` built once per command with the core functions the web collection
          page uses), picks the charts it names (`collectionChartEntries`, `collectionChartRow`, and
          `collectionChartDone` for each chart's `done`) and finds the songs the catalog lacks
          (`missingCollectionSongs`).
        - `relatedView.ts` works out what uses a song or a chart (`relatedTo`: the collections whose
          conditions name it with the charts each condition asks for, the dan courses that have it
          as a track and the gates that take it as a key or pool song, by the same rules as the
          `charts` filters).
        - `statusView.ts` shapes what `status` says about the two downloaded sources
          (`sourceStatus`: when it was fetched, its age, whether it is fresh, stale, built by
          another version or missing, and the counts it holds) and the upstream songs that were
          merged (`mergedDuplicatesOf`).
        - `views.ts` is the contract `sql` offers. `PUBLIC_VIEWS` lists `v_charts` (including the
          default user's score), `v_scores`, `v_score_events`, `v_rating_history`, `v_collections`,
          `v_collection_targets`, `v_user_items`, `v_user_characters`, `v_course_tracks`,
          `v_favorites` (one row per favorite entry), and `v_sync_runs` (one row per journal row,
          newest first), each a SELECT over the tables (optionally
          after a `WITH` prefix; `v_collection_targets` uses one to parse each collection condition
          once instead of once per row) with its columns described and the downloaded sources it
          needs, so a query only makes current what it reads. `VIEWS_VERSION` rises when a query
          could notice a change and `VIEWS_CHANGES` records those versions; `viewsMentionedIn` finds
          the views a query names.
        - `schemas.ts` holds the JSON Schemas of the shapes several commands print (the chart row
          and its collection and course variants, a song's type, what uses a song or a chart, a
          source's status, a setting row), written with the builders of `src/output/schema.ts` and
          reused by each command's `dataSchema`.
    - `src/refs/` turns what a user typed into those entities.
        - `difficulty.ts` has the difficulty spellings, and `status.ts` the game's spellings of
          ranks, combo statuses and sync statuses, the score conditions of `charts --achieved` and
          `--missing` (`parseScoreCondition`, `scoreReachesCondition`) and the `--target` of
          `charts --sort gain` (`parseTargetRate`).
        - `level.ts` reads levels such as `13+`, and ranges where `13..14` takes `13`, `13+` and
          `14`; `version.ts` finds a CN version by name, by name without `maimai ` or `舞萌`, by a
          unique part, or by its plate character.
        - `named.ts` holds the steps gates, courses, plates and collections are looked up by: a
          whole name, then a part of a name that only one item has; several hits are `AMBIGUOUS_REF`
          with at most 10 candidates, none is `NOT_FOUND` with the 5 nearest names or a fallback
          list.
        - `gate.ts` (`resolveGate`: id, name or short name), `course.ts` (`resolveCourse`: id or
          name), `plate.ts` (`resolvePlate`: a plate or the joined label of neighbouring plates with
          the same requirements, such as `熊華極`) and `collection.ts` (`listCollections` of every
          kind, `resolveCollection`: `kind:id` or a whole name; candidates are written as `kind:id`)
          use those steps.
        - `setting.ts` (`resolveSetting`) finds a setting by its whole dotted key without regard to
          case or width, never by a part of a name, because `config set` writes.
        - `song.ts` (`resolveSong`) takes a music id, chart key, exact title, exact alias, then the
          search index, with `AMBIGUOUS_REF`/`NOT_FOUND` candidates, and `chart.ts` (`resolveChart`)
          a chart key, or a song reference plus difficulty and `--type`.
        - `user.ts` resolves the default position, a numeric index, an exact uid or display name,
          then a folded display name; `favorite.ts` resolves a favorite by its whole name, then by a
          part that only one favorite has.
        - `time.ts`: `parseTime` reads ISO 8601 times, in the machine's zone when written without
          one; `parseTimeOption` turns anything else into `USAGE`; `parseSinceOption` also takes a
          positive number of days or hours counted back from now, such as `7d` or `24h`.
    - `src/users/` is the only writer of the user tables. It validates token-free raw users and
      score events, projects their typed copies, assigns catalog chart keys, preserves user order,
      provides raw-user, row-count and event reads, and shapes the credential-free rows used by
      `user` and `status`. Replacing music recomputes every stored user chart key in the catalog
      transaction. `rows.ts` also gives `userForCoreScores`, a copy of a user without the raw score
      and rating-history values core cannot look up, which the score commands pass to core;
      `users.raw` and exports keep them.
        - `lxnsBind.ts` starts the OAuth transaction, checks the callback under the user's sync
          lock, and saves the exchanged token before binding the account in SQLite. It uses the
          token's profile claims, like the web app, and creates no `sync_runs` entry.
        - `scores.ts` reads one selected user's score source, play-count estimates and B50 positions
          once for chart rows (keeping that normal B50 selection, which every `gain` is computed
          against), and turns a stored score into the core `ChartScore` the collection functions
          read (`collectionChartScore`).
        - `history.ts` reads the score events and the records' links in one consistent view and
          builds each record's timeline before `--since` and the play-count filter apply;
          `readChartScoreHistoryEntries` gives one chart's timeline to both `history <chart>` and
          `chart --with history`.
    - `src/favorites/repository.ts` is the only writer of the favorite tables and keeps their
      positions contiguous.
    - `src/sync/` holds score syncing, the `sync_runs` journal, sync locks and token refresh.
        - `types.ts` defines sync options, result data shapes, change items, sources and modes.
        - `sources.ts` resolves sync sources (`auto`, `ingame`, `lxns`, `df-token`, `df-name`),
          builds credential-bearing user working copies for core, and checks expired LXNS tokens.
        - `clients.ts` constructs `SyncClients` with core clients and network retries, wraps calls to
          capture upstream errors, and maps them to `CliError`.
        - `changes.ts` calculates score change items between before and after, orders by rating
          gain, and computes summary counts (`charts`, `added`, `improved`).
        - `storedUser.ts` (`applySyncToStoredUser`) applies an update to a stored user as the web app
          does: core reads the copy without the records it cannot look up, the update replaces
          `detailed` and `b50` only when it has them, and every other part of the stored data stays
          as it was.
        - `execute.ts` coordinates sync execution: acquires `withSyncLock`, records `beginRun`,
          fetches scores, writes transactionally with `applySyncToStoredUser` and
          `buildScoreHistoryBatchEvents`, records `finishRun`, and formats the returned `data`.
        - `journal.ts` is the sole writer of the `sync_runs` table (`beginRun`, `finishRun`,
          `recordRun`, `readRuns`). It checks summaries recursively against credential keywords and
          rejects non-plain JSON values, ensuring no token or secret is ever recorded.
        - `lock.ts` manages the per-user sync lock `sync:<uid>` (`withSyncLock`, `assertNoSync`).
          It auto-renews while active, marks abandoned runs as interrupted upon taking the lock, and
          protects concurrent mutations.
        - `lxnsToken.ts` refreshes LXNS access tokens under the caller's sync lock (`lxnsAccessToken`),
          used by `sync` before score requests. It uses settings `lxns.refreshTokenDays` and
          `lxns.expiringWarnDays`. Under the account rule, it writes refreshed tokens
          (`lxnsAuthorization`, `lxnsAccountId`, `lxnsIssuedAt`) conditionally only if the stored entry
          still matches the refreshed authorization's account and refresh token, and on
          `invalid_grant` or identity change clears credentials only if the entry still matches.
    - `tests/` holds the Vitest suite.
        - `harness.ts` runs a command line in-process with captured output; `createHarness` has no
          network unless a test brings one. `mockHttp.ts` answers requests from a table, and
          `delayedRoute` answers late and honors the request's signal.
        - `setup.ts` gives each test file a throwaway `SALTNET_HOME` and `HOME`, and `tempHome.ts`
          gives each test its own fresh data directory.
        - `fixtureCatalog.ts` builds the song catalog of the fixed SaltMeta fixture,
          `madeCatalog.ts` builds made-up songs for tests (as a catalog, or as a complete
          `SaltMetaBuildResult` to store), and `madeChart.ts` makes one made-up
          chart as a catalog entry for the sort and group tests.
        - `madeUsers.ts` inserts made-up users and all their child rows directly with SQL for store
          and view tests, and `scoreUsers.ts` writes made-up score users through the repository for
          chart-row tests.
        - `commandRun.ts` runs one command through the harness against the mocked network (a test
          can add or remove environment variables) and fails the test when the command fails with
          an error code it does not publish.
        - `dataSchema.ts` checks a value against a published schema with Ajv in strict mode;
          `commands/describe.test.ts`, `schema.test.ts`, `guide.test.ts` and `errorCodes.test.ts`
          cover the generated descriptions and published failures.
        - `examples.ts` lists the commands without a guide example (`sync`, which only talks to
          accounts); every other command needs one.
        - `caught.ts` returns the `CliError` a call throws, and `zone.ts` (`useTimeZone`) runs a
          test file in a fixed time zone (the commands write times in the machine's own offset).
    - `e2e/` builds a bundle with `build.mjs --outfile` in a temporary directory, preloads a
      fixture-only `fetch`, and seeds it with one refresh, an import of the made-up web backup
      (`shared/core/fixtures/web-backup-v1.json`, confirmed through its `error.fix`) and a favorite.
      It checks the score commands against what the core functions give for that backup (the gains
      on a copy of the seed with a user without scores, since the backup's made-up ratings leave
      every gain of its users at 0) and runs every generated guide example offline on its own copy
      of the seed data; an example with `--fields` must hold exactly those fields of the rows the
      same command prints without it. Each example has its own working directory containing a seed
      backup for the import example. A confirmation example may return exit code 6; the test
      validates its failure envelope and runs `error.fix` against the same data and working
      directory.

Static assets belong in `public/`; structured source assets belong in `src/assets/`. Utility and generated-data scripts live in `script/`. Do not edit generated `dist/` files or local `.wrangler/` state.

## Architecture & Navigation Index

Start feature tracing at the route in `src/components/app/router.ts`, then follow the page into its data module or integration adapter. Production uses hash history while development uses HTML5 history; dialog navigation is coordinated between `src/stores/dialog.ts` and `src/stores/router.ts`. For B50 image issues, inspect `src/components/rendering/takumiB50.tsx`, `shared/rendering/`, then `render-service/src/http.tsx`. For music-data updates and search indexing, check `shared/core/music/saltmeta.ts`, `shared/core/music/fetch.ts`, `src/components/data/music/musicApi.ts` (the web wrapper that reports failures), `src/components/data/music/index.ts` (cache and Vue state), and `shared/core/music/search.ts`. For songs-page ordering, category filtering, position indexes, text search, grouping and statistics, inspect the pure functions in `shared/core/query/songs.ts`; `src/pages/songs.vue` only passes its reactive state to them, and `shared/core/query/songs.test.ts` snapshots their results (`pnpm test:query`). For B50-page record selection, sorting and rating sums, inspect the pure functions in `shared/core/query/b50.ts`; `src/pages/b50.vue` only passes its state to them, and `shared/core/query/b50.test.ts` snapshots their results (`pnpm test:query`). For the chart info dialog's rating calculations, inspect the pure functions in `shared/core/query/chartInfo.ts`; `src/components/data/chart/ChartInfo.vue` only passes its state to them, and `shared/core/query/chartInfo.test.ts` snapshots their results (`pnpm test:query`). For dan-course data or its songs-page category, inspect `shared/core/course/` and `src/pages/songs.vue`. For KALEIDXSCOPE gate data or its songs-page category, inspect `shared/core/kaleidxscope/`, `src/components/data/kaleidxscope/`, and `src/pages/songs.vue`; life timestamps are stored with the CN UTC+8 offset. For collection or version-plate data, trace `shared/core/integrations/lxns/fetchCollection.ts` (via the web wrapper `src/components/integrations/lxns/fetchCollection.ts`), `shared/core/collection/map.ts`, `src/components/data/collection/index.ts` (cache and Vue state), then `src/pages/collections.vue` or `src/pages/songs.vue`. Version-plate tabs combine adjacent plates with identical score requirements into compact labels such as `熊華極` (sharing the category suffix once) through `getVersionPlateTabs` in `shared/core/collection/versionPlate.ts`, retaining the first plate as the selection value. Broader data-shape notes are documented in `docs/component-data-types.md`.

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
PKCE, the authorize URL, the callback and transaction checks, the code exchange and the token
expiry check come from `shared/core/integrations/lxns/oauth.ts`; the storage, the recovery and the
dialogs stay in `src/components/integrations/lxns/`.

## Build, Test, and Development Commands

Install all workspace dependencies with `pnpm install`. From the repository root:

- `pnpm dev` starts the frontend Vite server.
- `pnpm check` runs Vue/TypeScript checks, the DOM-free `shared/core` type check, the `cli/` type check, and verifies Prettier formatting.
- `pnpm lint` runs ESLint across the repository. Violations that predate the CLI work are frozen in
  `eslint-suppressions.json` (ESLint bulk suppressions), so only new violations fail. After fixing
  old ones, run `pnpm exec eslint . --prune-suppressions` to shrink that file; when moving a file
  that has suppressed violations, move its entry along with it. The antfu defaults skip every
  directory named `output`; `eslint.config.js` un-ignores `cli/src/output/` and
  `cli/tests/output/` only, so a new source directory of that name must be added there too.
- `pnpm build` type-checks, builds the frontend, and generates build metadata.
- `pnpm preview` serves the production frontend build locally.
- `pnpm build:cli` bundles the CLI into `cli/dist/saltnet.mjs` (run it with
  `node cli/dist/saltnet.mjs <command>`; `saltnet guide` prints the rules, commands, error codes and
  views an agent needs, and `saltnet schema` describes the same machine-readably); `pnpm test:cli`
  runs its fast unit suite. `pnpm test:cli-e2e` builds its own bundle into a temporary directory and
  runs every guide example against fixed data without network access. When developing or testing
  the CLI, point `SALTNET_HOME` at a temporary directory so the real `~/.saltnet` is never read or
  written. The bundle bakes in the web app's `.env` defaults, so do not paste the output of
  `config list` or `config get` anywhere public.
- `pnpm --filter saltnet-render-service dev` starts the Worker with Wrangler.
- `pnpm --filter saltnet-render-service test` runs its Vitest suite.
- `pnpm --filter saltnet-render-service check` type-checks the service.
- `pnpm test:course` validates the static dan-course snapshot and ordered chart matching.
- `pnpm test:kaleidxscope` validates the gate, noise-stage, and final-sequence snapshot, life-phase boundaries, and chart matching. Unconfirmed life calendars remain empty unless explicitly requested as estimates; the noise calendar uses a labeled three-day estimate from October 1 at 07:00 UTC+8.
- `pnpm test:collection-index` runs focused tests for collection caching, initialization, the
  LXNS collection fetch and mapping, static character/partner data, the ChartInfo reverse
  association index (core builder and web wrapper), collection ownership and scored collection
  charts, and version-plate tab merging.
- `pnpm test:score-history` validates score-change detection, building batch events, IndexedDB
  history, generations, user-backup compatibility, and rating-history normalization.
- `pnpm test:recent` validates the recent charts tab ordering, score change timestamp sorting, and limits.
- `pnpm test:music-search` validates music search transliteration, script variants, and metadata indexing.
- `pnpm test:music-data` validates SaltMeta fetching (success, HTTP, version and network failures), restoration of cached music data, the duplicate-song merge, and the shared SaltMeta and LXNS test fixtures.
- `pnpm test:integrations` validates the Diving Fish client and converter, the SaltNet backend
  client with a made-up fetch, that the web wrappers keep the web app's errors and logging, and
  the sync, applying updates, and `toHalfWidth` tests.
- `pnpm test:query` compares the songs-page query helpers (ordering, category filtering, position
  indexes, search, grouping and statistics), the B50 page's record selection, sorting and rating
  sums, the B50 gain (`b50Gain.test.ts`, checked by hand), and the chart info dialog's rating stage tables, display modes and B50 floor with committed
  snapshots on the fixed fixture data, validates every DX-score star threshold, and validates web
  search relevance, stable ties, compatibility with the existing match set and chart positions.
  Regenerate the snapshots only for an intentional behavior change.
- `pnpm test:build-info` verifies that version timestamps ignore documentation-only and
  formatting-only commits.
- `pnpm test:oauth` validates callback cleanup, authorization recovery, user identity targeting,
  token response compatibility, refresh-token handling, serialized durable user writes,
  initial dialog-history reconciliation, the core token and client tests, and the core OAuth
  helpers (PKCE against the RFC 7636 example, the authorize URL, the callback and transaction
  checks, the code exchange and the token expiry check).

There is no aggregate test script: before committing, run `pnpm check`, `pnpm lint`, every
`pnpm test:*` script above, and the render-service `test` and `check` commands (plus `pnpm build`
for web changes).

## Coding Style & Naming Conventions

Use TypeScript and Vue single-file components. Prettier enforces four-space indentation, double quotes, semicolons, 100-character lines, and LF endings; use `pnpm pret:fix` for formatting. ESLint uses the Antfu Vue/TypeScript configuration. Keep Vue block order as `script`, `template`, `style`; use kebab-case component names in templates. Name components in PascalCase (`ChartInfo.vue`), composables with `use...`, and variables/functions in camelCase.

## Testing Guidelines

Vitest tests live in `render-service/tests/`, alongside focused frontend data modules, and next to
the modules in `shared/core/`, using `*.test.ts` or `*.test.tsx`. Core tests may read fixed data
with Node built-ins but must not import anything from `src/`; the fixed data they share lives in
`shared/core/fixtures/`. The build metadata script has a Node test at
`script/generateBuildInfo.test.cjs`. Add focused regression cases alongside the affected service,
frontend module, core module, or script code. No coverage threshold is enforced.
Frontend changes must at minimum pass `pnpm check`, `pnpm lint`, and `pnpm build`; manually
exercise affected routes and browser back/forward behavior for UI or dialog changes. Before moving
page logic into `shared/core/`, snapshot its behavior on fixed data first (see
`shared/core/query/songs.test.ts`) so that the move can be shown to change nothing.

## Commit & Pull Request Guidelines

Follow the repository's Conventional Commit style, such as `feat: add reversed song tab setting`, `fix(render): cache full B50 fonts`, or `style(chart): refine spacing`. Keep commits narrowly scoped. Pull requests should explain behavior changes, link relevant issues, list validation commands, and include before/after screenshots for visible UI work. Review AI-generated code for readability and disclose the tool and model used, as required by the README.

## Security & Configuration

Never commit API keys, tokens, or local Wrangler state. Keep deployment-specific values in environment configuration and document any newly required variables in the relevant package.
