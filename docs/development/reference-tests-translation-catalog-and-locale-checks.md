# Translation Catalog and Locale Checks

[Back to Tests and Checks](tests.md#translation-catalog-and-locale-checks)

The normalized catalog is hand-maintained through `pnpm run localization:catalog --`; agents do
not parse or edit its row JSON directly. `copies.json` owns descriptors, `aliases.json` owns
consumer keys, and `translations/<locale>.json` owns locale text. Generated `routes.json` is
route-selector membership, not translation authoring input. Native resources are produced from the
typed native-consumer manifest into the separate native-client checkout. These checks guard the
producer contract:

- `ts-shared/ui-messages/index.test.mts` (`loadMessages` block) — JSON catalog load and locale
  fallback for the web consumer tree.
- `ts-shared/ui-messages/index.test.mts` (`onUnresolved` cases) and
  `ts-shared/ui-messages/catalog-tree.test.mts` (`lookupCatalogLeaf`) — default `createTranslator`
  still throws on a missing or non-leaf key; with `onUnresolved` those keys degrade and unknown
  select-plural cases still throw.
- `ts-shared/ui-messages/parity.test.mts` — cross-locale key parity: catches
  `es`/`fr`/`pt` keys missing or extra vs. `en`, and leaf-kind (string vs. serializable
  descriptor) mismatches.
- `ts-shared/ui-messages/native-resources.test.mts`,
  `native-resource-export.test.mts`, and
  `native-consumer-usage.test.mts` — native manifest/catalog validity, CLI generate/check against an
  isolated consumer checkout, real Swift/C#/XAML consumer ownership, placeholder and descriptor
  parity, deterministic output, escaping, and stale/missing/extra file detection. Catalog CLI
  subprocesses use a 30s timeout, matching `index.test.mts` locale assembly.

Every live web server and browser fetches `GET /api/v1/localization` for a versioned web-chrome
selector plus one versioned exact current-route selector (`web/lib/i18n/webSelectorsForPath`). The server resolves those
selectors through generated `routes.json`; Vitest may query the catalog runtime directly. These
checks guard that request-selection contract instead of catalog content:

- `web/lib/i18n/__tests__/localized-route-boundary.mock.test.tsx` — changes the pathname under the
  persistent root layout and proves the destination batch resolves and merges before its translated
  route copy renders. The route cache is keyed by locale and pathname, while the regular locale
  cache keeps merged chrome and already-visited route copy available to shared UI.
- `web/lib/i18n/__tests__/get-translations.mock.test.ts`,
  `web/lib/i18n/__tests__/use-translations-unresolved.test.tsx`, and
  `web/lib/i18n/__tests__/report-unresolved-message.test.ts` — a selected-catalog miss returns
  an empty string, reports one Sentry error per key per translator, and does not toast.

- `web/lib/i18n/__tests__/localization-selectors.test.ts` — combined selector checks and route
  lookup coverage for the generated selector IDs. The full transitive import-closure proof runs in
  the generated-map check below; repeating graph queries inside web tests contends on the shared
  `no-mistakes` lock.
- `static-code-analysis/i18n-extract/route-bounds.test.mts` — compiles the real catalog, caches
  package-runtime responses per selector, checks every generated route's combined copy in English,
  Spanish, French, and Portuguese against selector, message, and serialized payload limits, and
  compares representative routes against direct combined requests.
- `playwright/tests/routes/localization-availability.spec.mts` — renders login, admin AI costs,
  and the dynamically loaded growth dashboard in English against the backend, with the browser
  error monitor enabled.
- `pnpm run test:localization:tmux-smoke` — live local Worker smoke for `/`, `/login`, and `/news`.
  It probes backend catalog revision before browser navigation. `LOCALIZATION_SSR_REVISION_DIAGNOSTIC=1`
  adds a Next-origin HTML check that the development `data-localization-ssr-revision` marker matches
  that backend revision (`dev/localization/ssr-revision-diagnostic.mts`). Ordinary Playwright smoke
  stays English-only; the SSR cache TTL tests live in `web/lib/i18n/__tests__/load-server-messages.mock.test.ts`.
- `web/scripts/tests/smoke-test-web.sh` — compiles only the real homepage and chrome selectors
  for its standalone backend, then verifies the production web server through that backend. The
  all-route SQLite sweep above owns catalog-wide bounds coverage.
- `.github/workflows/build-web.yml` — the Docker image smoke starts the same real localization
  resolver against a compiled homepage catalog and supplies its URL to the running web image.
- `pnpm exec vouchington-localization format --check --source localization/catalog` — reads every
  formatter-owned row table, rejects noncanonical serialization and catalog semantic failures, and
  never rewrites catalog source. It runs as "Check localization catalog format" in static-analysis
  CI; use `pnpm run localization:catalog -- format` when an agent must rewrite rows through the
  authoring CLI.
- `static-code-analysis/i18n-extract/route-selector-map.test.mts` — unit-tests `assembleRouteAliasMap` and route discovery on tiny fake-git fixtures in the `i18n-extract-codemod` Vitest project. Graph closures live in `route-selector-map.mock.test.mts`, which mocks a single `analyzeProject` call (the real graph resolves dynamic imports itself, so there is no separate `resolveCheck` worklist to mock) so tooling Vitest never waits on the user-global no-mistakes lock (formerly filed as jonathanong/filaments#11696). The 25s analysis budget remains on `analysis-budget.mts` for genuine lock diagnostics and is not applied to production `--check`.
- `static-code-analysis/i18n-extract/route-selector-map.mts --check` — regenerates
  `web/lib/i18n/route-selectors.generated.mts` and `localization/catalog/routes.json` (stable
  selectors and pattern-keyed alias membership for every real `web/app` route) and fails if either committed
  artifact is stale. It makes one no-mistakes `analyzeProject` call per route/global-chrome file,
  requesting `import-static`, `import-dynamic`, `import-type`, and `workspace` relationships;
  no-mistakes follows dynamic import targets (including `next/dynamic`) recursively within that
  same closure. It then lexically matches known alias literals. It does not parse source with an
  AST. Add `--diagnostics` for stderr-only phase timings and a computed-closure count. The local
  `--check` is optional; CI owns this costly freshness check in
  `.github/workflows/static-code-analysis.yml` as "Check web route localization selector map".
  Run without `--check` and commit both artifacts when a route, its imports, shared chrome, or a
  web alias change alters route membership. Translation-text edits that leave web aliases and
  route membership unchanged need no local graph command. This closure check does not prove every
  possible value of `t(variable)`; that separate guardrail gap is tracked as a follow-up (formerly
  filed as jonathanong/filaments#11647).

The catalog and native-resource tests run as the `ts-shared` Vitest project:

```bash
pnpm run test:ts-shared
pnpm run native-localization:check
```

Targeted two-file form, following the [Project Name Reference](reference-project-name-reference.md#project-name-reference) pattern:

```bash
pnpm exec vitest run --project ts-shared ts-shared/ui-messages/index.test.mts ts-shared/ui-messages/parity.test.mts
```

After any rebase that touches a file under `localization/catalog/`, **run
`pnpm run test:ts-shared` explicitly.** Two real incidents (PR #7168, PR #7188) shipped catalog
drift a rebase introduced that surfaced only after many pushes. After changing catalog JSON,
run the command above rather than relying on CI to discover it.

After changing the manifest or one of its catalog leaves, validate the Filaments producer with
`pnpm run native-localization:check`. Generate or check native output only from the native-client
checkout boundary, passing both absolute roots. The exporter scans the external Swift app/UI
sources, C# product sources, and MAUI XAML: every reference must have the matching platform claim,
and every manifest claim must have at least one real product consumer. Generated
`.__plural.*`/`.__select.*` resource variants normalize to their descriptor leaf and are not
independent manifest entries.

```bash
node dev/native-localization.mts \
  --output-root /absolute/path/to/vouchington-clients \
  --consumer-root /absolute/path/to/vouchington-clients
node dev/native-localization.mts \
  --output-root /absolute/path/to/vouchington-clients \
  --consumer-root /absolute/path/to/vouchington-clients \
  --check
```

`native-localization:check` validates the producer catalog in CI static analysis. Export freshness
and external native-consumer usage are checked from the client checkout; native product source,
generated resource, catalog, manifest, generator, runtime, and localization-guard paths already
select existing native, `ts-shared`, or tooling jobs as appropriate.

Other translation consumers, one command each (see [LOCALIZATION.md § Translation Validation
Checklist](../requirements/users/LOCALIZATION.md#translation-validation-checklist) for the full
checklist and consumer matrix):

- `pnpm run test:email-templates` — transactional email catalog resolution.
- `pnpm run test:web` — web locale resolution (`resolveUiLocale`/`getResolvedUiLocale`).
- From a [vouchington-clients](https://github.com/vouchington/vouchington-clients) checkout,
  `swift-clients/tooling/with-build-lock.sh swift test --package-path swift-clients/ui` (+ the
  equivalent locked `swift-clients/core` command) — Swift `ui_locale` wiring.
- From the same client checkout,
  `dotnet-clients/tooling/with-build-lock.sh dotnet test dotnet-clients/Voucha.DotNet.sln --configuration Release`
  — .NET `ui_locale` wiring.

See also [docs/prompts/scheduled/ui-internationalization.md](../prompts/scheduled/ui-internationalization.md).
