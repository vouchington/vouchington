# Localization

Voucha is one canonical site with multilingual content. UI localization, user
country, detected content language, and translated content are separate concepts.

## Canonical URLs

- Do not add locale-prefixed routes such as `/en/*` or `/fr/*`.
- Do not add `hreflang` alternates until translated pages have stable crawlable
  URLs.
- Canonical URLs remain language-neutral unless a future product decision creates
  first-class translated URLs.

## Canonical Catalog

Product copy is compiled from committed normalized tables in `localization/catalog/` into an
immutable SQLite artifact shared by the API and worker images. `copies.json` owns stable copy IDs
and descriptors, `aliases.json` maps each consumer-visible key to a copy ID, and
`translations/<locale>.json` maps each copy ID to its text. `routes.json` is generated web route
membership: each row keys an alias by route pattern, while an alias-less row retains a known route
with no route-local copy. It is not an authoring table.
`GET /api/v1/localization` serves bounded public batches (`web`, `swift`, `dotnet`) with ETag
and TTL. Email copy is resolved locally from the same revision and never over HTTP. `en`
aliases `en-US`. Each table is a JSON array with **one compact row per line**. Do not
pretty-print catalog JSON; oxfmt ignores `localization/catalog/**`.

Local `./dev/tmux` compiles the catalog into the ignored worktree artifact
`.local/localization/catalog.sqlite` before it starts the API and worker windows. It records a
revision of the catalog and installed localization packages beside that artifact, reuses an
unchanged build, and recompiles after catalog or package changes when a stopped tmux session is
started again. The deployed API and worker images continue to
use their immutable `/app/localization/catalog.sqlite` artifact.

Agents add, replace, or delete catalog rows only with the catalog CLI. They must not parse or edit
catalog JSON as a document:

```bash
pnpm run localization:catalog -- copy-set --source localization/catalog --id copy.common.ok
pnpm run localization:catalog -- translation-set --source localization/catalog --locale en-US --id copy.common.ok --value '"OK"'
pnpm run localization:catalog -- alias-set --source localization/catalog --consumer web --alias common.ok --copy-id copy.common.ok
pnpm run localization:catalog -- format --source localization/catalog
```

Git merges the row-based copy, alias, route, and per-locale translation tables by their logical
keys when the clone has the merge driver configured. Run `./dev/initialize monorepo` before
merging catalog rows: it writes the path-aware driver to the clone's shared Git config, which
ordinary linked worktrees share. Different locale edits auto-merge; conflicting edits to the same
row require the CLI conflict resolver. Catalog JSON must use LF.

```gitattributes
localization/catalog/*.json merge=vouchington-localization text eol=lf
localization/catalog/translations/*.json merge=vouchington-localization text eol=lf
```

```bash
git config --get merge.vouchington-localization.driver
# vouchington-localization git-merge %O %A %B --path %P
```

## Catalog authoring and conflicts

Use `pnpm run localization:catalog --` for every production catalog mutation; do not edit or
parse JSON directly. The command provides `alias-set`/`alias-remove`, `copy-set`/`copy-remove`,
`translation-set`/`translation-remove`, `format`, `csv-export`, `csv-import`, `git-merge`, and
`conflict-resolve`. `routes.json` comes only from the route selector generator.

`csv-import` parses and serializes the CSV first, stages copies, aliases, and locale tables in a sibling directory, validates that staging catalog, then atomically replaces those outputs. Locales absent from the CSV disappear with the translations directory swap. A failed import leaves prior tables unchanged and publishes no partial catalog. It never rewrites generated `routes.json`.

```bash
pnpm run localization:catalog -- copy-set --source localization/catalog --id copy.nav.about
pnpm run localization:catalog -- translation-set --source localization/catalog --locale en-US --id copy.nav.about --value '"About"'
pnpm run localization:catalog -- alias-set --source localization/catalog --consumer web --alias nav.about --copy-id copy.nav.about
pnpm run localization:catalog -- format --source localization/catalog
```

The configured driver uses the logical `%P` catalog path, because Git passes temporary files for
`%O`, `%A`, and `%B`. On a same-row conflict, inspect the driver's row markers and choose a value
with `pnpm run localization:catalog -- conflict-resolve
--file <file> --id <id-or-alias> --consumer <consumer> --take ours|theirs`. Repeat for each
conflict; the CLI preserves auto-merged rows and writes canonical JSON once the last conflict
resolves. Finish with `format --source localization/catalog` and stage the file. No JSON hand edit
is required.

## CSV interchange

CSV is interchange only: never the source of truth and never compiled directly to SQLite.
Export from committed authoring tables, import back to tables, then compile. The compiler validates
IDs, locales, duplicate rows, placeholders, descriptors, and the source contract hash
(`catalog_revision`).

```bash
pnpm run localization:catalog -- csv-export --source localization/catalog --output /tmp/catalog.csv
pnpm run localization:catalog -- csv-import --input /tmp/catalog.csv --output /tmp/imported
```

Import writes normalized `copies.json`, `aliases.json`, and locale translation tables as one
replacement. It excludes generated route membership and does not rewrite `routes.json`. Review
the imported rows through the CLI, copy accepted rows into the production tables through the CLI,
then format and compile.

## UI Locale

- Root `<html lang>` must describe the actual UI message language being rendered.
- UI message catalogs (`@ts-shared/ui-messages`) cover `en`, `es`, `fr`, and `pt`
  site-wide. `en` is canonical; `es`/`fr`/`pt` are machine-translated and gated by
  a key-parity test against `en` (`ts-shared/ui-messages/parity.test.mts`).
  Native review of the machine-translated copy is a tracked follow-up, not a
  blocker for shipping the catalogs.
- Runtime message loading: every live web server and browser fetches
  `GET /api/v1/localization` for a membership-derived web-chrome selector plus one exact current-route selector
  when that route has route-local copy.
  `web/lib/i18n/route-selectors.generated.mts` maps every `web/app` route pattern to its
  membership-derived selector ID and whether it has route-local copy, while generated
  `localization/catalog/routes.json` maps each pattern to the exact aliases it renders. A selector
  ID changes only when that selector's aliases change. `static-code-analysis/i18n-extract/route-selector-map.mts` regenerates both
  artifacts from no-mistakes dependency closures, which already follow dynamic imports (including
  `next/dynamic`) recursively, then a quoted-only lexical scan of alias-shaped literals. Quoted
  tokens that are not web catalog aliases fail generate/`--check`. Reachable `t()` template
  interpolation or concatenation, production `as MessageKey` casts, unresolved reachable
  local imports, and computed `import()`/`require()` rows also fail. Package specifiers stay
  external. The generator also fails computed `import()` lexically. It does not parse `t()` arguments with an
  AST, and `dynamic-import-closure.mts` does not exist. Dynamic keys must be quoted aliases in a
  module the route/layout/chrome graph can reach, typically a finite `Record<Enum, MessageKey>`
  (or equivalent object of quoted aliases). Open `Record<string, MessageKey>` maps need a finite
  fallback key. `MessageKey` itself is not a catalog-membership proof.
  CI runs `--check` and fails if either artifact drifts; the local check is optional. Regenerate
  and commit both artifacts after changing routes, their imports, shared chrome, or web aliases in
  a way that changes route membership. Translation-text-only edits do not need the graph command.
  Module reachability still does not prove every runtime value of `t(variable)` for missing map
  entries. Each web load requests the exact
  chrome and current-route selector IDs in one batch. Vitest
  can assemble the committed JSON directly; live Next servers, including local development and
  Playwright, use the backend. The standalone production web smoke test
  starts the backend localization resolver over HTTP against a freshly compiled catalog. The
  initial route renders without an outer Suspense boundary so SSR redirects and 404s retain their
  response status; the client route boundary suspends on destination navigation after hydration
  until its backend catalog arrives. Guard assembly and locale fallback with
  `ts-shared/ui-messages/index.test.mts` and key parity with
  `ts-shared/ui-messages/parity.test.mts`. Whenever catalog JSON changes — especially after
  rebasing from main — run `pnpm run test:ts-shared` before pushing so both guards see the
  change. See [tests.md § Translation Catalog and Locale
  Checks](../../development/tests.md#translation-catalog-and-locale-checks) for
  the full reproduce/recovery detail.
  Server batch caches expire from the response's `ttlSeconds`. An expired entry serves its last
  good catalog while one refresh runs; a failed refresh preserves that catalog and waits 60 seconds
  before retrying. A failed initial server load is evicted so the next request can retry. In the
  browser, a rejected locale or route load stays cached through React's replay render; the error
  page or global error screen's Try again action invalidates only failed entries before resetting
  the route.
  A `t()` key missing from that selected catalog (selector gap, rolling web/backend catalog
  skew, or a generator miss) must not 500 the route: `getTranslations` / `useTranslations`
  report the miss to Sentry at error severity and render an empty string. They do not render
  the raw key and do not load the full committed catalog. Default `createTranslator` without
  `onUnresolved` still throws, which is the fail-loud path for ts-shared tests and
  `defaultTranslator`.
- Catalog logic leaves are serializable `plural` or `select-plural` descriptors. The web
  translator evaluates them with cached `Intl.PluralRules`; a selected API response can therefore
  cross the server/client bootstrap boundary without executable-leaf reconstruction. Native-only
  aliases are tooling inputs, not web runtime data: the native generator selects its consumer
  aliases from the same normalized catalog, while web locale loading and hydration request only
  web selectors.
- Native clients consume only paths listed in
  `ts-shared/ui-messages/native-consumer-manifest.mts`. A platform claim is valid only while at
  least one active product source consumes it: Swift app/UI typed references satisfy `swift`;
  C# `UiMessageKey` and MAUI XAML `DynamicResource`/message-format references satisfy `dotnet`.
  Swift discovery accepts typed bare-key shorthand but not unrelated qualified members with the
  same spelling. MAUI XAML discovery parses the document structure, so commented resource
  references never satisfy a product claim.
  Native-only copy is represented by `swift` and/or `dotnet` alias rows in
  `localization/catalog/aliases.json`; the native generator resolves those aliases against the
  matching locale translation rows. Web bundles and hydration payloads never include native-only
  aliases. Native apps currently render bundled generated resources. A
  [draft client change](https://github.com/vouchington/vouchington-clients/pull/138) proposes
  overlaying live values from `GET /api/v1/localization`; that client-owned implementation remains
  the authority for its cache bounds, TTL, fallback, and refresh behavior until it ships.
  Unknown, wrong-platform, and unused claims fail the generator/check. Generated descriptor
  variants (`.__plural.*` and `.__select.*`) belong to their canonical manifest leaf and must not
  be listed separately. Run
  `pnpm run native-localization:check` validates the Vouchington producer after manifest/catalog
  changes. Generate and check Swift/.NET outputs from the external native-client checkout boundary
  with `node dev/native-localization.mts --output-root <absolute-client-root> --consumer-root
<absolute-client-root> [--check]`; the exporter rejects stale, missing, extra, or
  placeholder-incompatible output and validates external product usage.
- Provider-neutral moderation summaries use the shared `native.moderation.summary.*` namespace.
  Native review queues localize the server-owned disposition and aggregate evidence counts. They do
  not present raw `reason_codes` or reuse provider-specific Spam, Flagged, or score messages.
- Anonymous SSR resolves `Accept-Language` the same way authenticated SSR resolves
  a user with no saved `ui_locale` (`getResolvedUiLocale()` → `resolveUiLocale()`).
  This is safe because the Cloudflare Worker partitions the anonymous edge cache by
  resolved UI locale — see the cache-partition rule below — so the origin always
  renders into the same locale partition the Worker cached it under. Authenticated
  requests resolve and render the user's saved `ui_locale` immediately, since
  authenticated SSR is not served from the shared anon edge cache.
- UI locale support comes only from explicit message catalogs. Do not derive
  supported UI locales from content-detection languages or supported countries.
- Native clients must derive default `ui_locale` values from the preferred UI
  language list, not from account country or the regional formatting locale.
- Swift locale precedence is owned by `UiLocaleResolver`: a supported saved session locale wins,
  then the first supported normalized `Locale.preferredLanguages` entry, then English.
  `UiLocaleController` is injected at the app root as both an observable environment value and the
  SwiftUI `Locale`; session refresh, preference clearing, and sign-out update the same controller
  so already-visible views rerender without relaunch. `UiMessages` owns descriptor plural
  selection and all UI-locale number, percent, currency-code, and date formatting while preserving
  the caller's instant and time zone. App-owned copy uses `UiMessageKey`/`UiMessage`; user, server,
  and provider copy crosses `UiVerbatimText.verbatim`.
- .NET locale precedence and presentation formatting are owned by
  `UiLocaleController` and `UiLocalization` in `Voucha.Client.Core/Localization`.
  A supported saved session locale wins over the normalized device language, then
  English. Sign-out and clearing the preference return to the device fallback. The
  controller synchronously dispatches session-driven changes to the captured UI
  dispatcher. Transient view models subscribe through weak, disposable locale
  subscriptions so the singleton controller cannot retain closed pages. The MAUI app
  republishes generated messages as dynamic resources and updates existing shell
  titles and intent-page binding contexts in place, preserving the selected item and
  navigation stack. XAML presentation attributes use generated `DynamicResource`
  keys, while interpolated values, dates, numbers, and percentages use the
  locale-versioned `UiLocalizedValue` multi-binding backed by `UiLocalization`.
  Every `UiLocalizedValue` use must provide an explicit non-empty `Format` mode;
  omission is a XAML authoring error detected when the binding is constructed.
  Missing descriptor parameters and invalid `select-plural` cases are programmer
  errors rather than user-content fallbacks, so native localization runtimes fail
  fast instead of leaking generated resource keys. User and server copy must cross
  the explicit `UiText.Verbatim` boundary.
- Visible counts and other UI-owned numbers must be formatted with the resolved
  UI locale through shared format helpers. Server-rendered numbers must not use
  browser-only locale detection, because it can produce hydration mismatches.
- Anonymous SSR that varies by UI locale must either partition the Cloudflare
  Worker cache key by UI locale or keep the SSR response non-varying. The worker
  implements the former via `ctx.props.lang` on the `CachedOrigin` dispatch (see
  `cloudflare-worker/src/edge-ui-locale.mts`) — resolved from the session's `uil`
  claim or `Accept-Language`, and omitted at `DEFAULT_UI_LOCALE` so requests that
  resolve to `en` gain no extra cache fan-out (#6994).

## Translation Validation Checklist

Translation catalogs remain hand-maintained; native resource artifacts are deterministically
generated from a typed consumer manifest. Two rebases (PR #7168, PR #7188) shipped catalog drift
that a late-running parity test caught only after many pushes; this checklist makes both catalog
and native-resource guards discoverable up front. Command detail stays light here — see [tests.md § Translation Catalog and Locale
Checks](../../development/tests.md#translation-catalog-and-locale-checks) for the full
reproduce/recovery walkthrough.

Run this checklist for any PR that touches UI message catalogs or locale resolution, especially
after rebasing:

- [ ] **UI catalogs** (source of truth) — key/leaf parity only, not translation content.
      `ts-shared/ui-messages/index.test.mts` (catalog load + locale fallback) and
      `ts-shared/ui-messages/parity.test.mts` (`es`/`fr`/`pt` key parity
      against `en`). Command: `pnpm run test:ts-shared`.
- [ ] **Native generated resources** — manifest/key/descriptor/placeholder parity and deterministic
      Swift/.NET output in the external client checkout. Command:
      `node dev/native-localization.mts --output-root <absolute-client-root> --consumer-root <absolute-client-root> --check`.
- [ ] **Transactional email** — catalog JSON/SQLite resolution, not a live TypeScript copy tree.
      Own `resolveUiLocale` in `email-templates/locale.mts`. `email-templates/catalog-copy.test.mts`,
      `email-templates/locale.test.mts`, and per-template `*.test.tsx` snapshots. Command:
      `pnpm run test:email-templates`.
- [ ] **Web locale resolution** — `resolveUiLocale`/`getResolvedUiLocale` live in `web`, not
      backend; backend never imports `@ts-shared/ui-messages`, only threads a `uiLocale` string.
      `web/lib/i18n/__tests__/resolve-ui-locale.test.ts`, `web/lib/i18n/__tests__/get-resolved-ui-locale.mock.test.ts`,
      `web/lib/i18n/__tests__/get-translations.mock.test.ts`. Command: `pnpm run test:web`.
- [ ] **Swift native — `ui_locale` wiring** (not catalog parity). From a
      [vouchington-clients](https://github.com/vouchington/vouchington-clients) checkout, run these
      derivation/wire tests only:
      `swift-clients/ui/Tests/VouchaUITests/EmailOTPViewModelTests.swift`,
      `swift-clients/ui/Tests/VouchaUITests/SettingsViewModelLocaleTests.swift`, plus core wire tests. Command:
      `swift-clients/tooling/with-build-lock.sh swift test --package-path swift-clients/ui` (and the equivalent
      locked `swift-clients/core` command).
- [ ] **.NET native — `ui_locale` wiring** (not catalog parity). From the same client checkout:
      `dotnet-clients/tests/Voucha.Client.Core.Tests/Auth/AuthLocaleTests.cs`,
      `dotnet-clients/tests/Voucha.Client.Core.Tests/Localization/UiLocalizationTests.cs`, and
      `dotnet-clients/tests/Voucha.Client.Core.Tests/Settings/SettingsViewModel.LocaleActionsTests.cs`. Command:
      `dotnet-clients/tooling/with-build-lock.sh dotnet test dotnet-clients/Voucha.DotNet.sln --configuration Release`.

### Consumer matrix

| Consumer                       | Test(s)                                                                                             | Command                                                                                                                | Notes                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| UI catalogs (source of truth)  | `index.test.mts`, `parity.test.mts`                                                                 | `pnpm run test:ts-shared`                                                                                              | Key/leaf parity only, not translation content.                                                                                   |
| Transactional email            | `catalog-copy.test.mts`, `locale.test.mts`, per-template `*.test.tsx` snapshots                     | `pnpm run test:email-templates`                                                                                        | Own `resolveUiLocale` in `email-templates/locale.mts`. Workers resolve `email.*` from local SQLite; tests may read catalog JSON. |
| Web locale resolution          | `resolve-ui-locale.test.ts`, `get-resolved-ui-locale.mock.test.ts`, `get-translations.mock.test.ts` | `pnpm run test:web`                                                                                                    | `resolveUiLocale`/`getResolvedUiLocale` live in **web**, not backend; backend only threads a `uiLocale` string.                  |
| Native resource generation     | `native-resources.test.mts`, `native-resource-export.test.mts`                                      | `node dev/native-localization.mts --output-root <absolute-client-root> --consumer-root <absolute-client-root> --check` | Manifest keys generate locale resources plus typed Swift/.NET key and descriptor accessors in the external client checkout.      |
| Swift native (client checkout) | `EmailOTPViewModelTests.swift`, `SettingsViewModelLocaleTests.swift`, core wire tests               | `swift-clients/tooling/with-build-lock.sh swift test --package-path swift-clients/ui` (+ locked `swift-clients/core`)  | `ui_locale` derivation/wire plus generated message-resource consumption.                                                         |
| .NET native (client checkout)  | `AuthLocaleTests.cs`, `UiLocalizationTests.cs`, `SettingsViewModel.LocaleActionsTests.cs`           | `dotnet-clients/tooling/with-build-lock.sh dotnet test dotnet-clients/Voucha.DotNet.sln --configuration Release`       | Locale precedence, session/settings refresh, formatting, `ui_locale` wire, and generated message-resource consumption.           |

Use this matrix to check a broad localization change (e.g. adding a locale, renaming a catalog
key) across every consumer at once, not just the catalogs.

## Transactional Email Locale

- Voucha-authored transactional email templates accept an optional `uiLocale` and
  fall back to English through `resolveUiLocale()` when it is absent or invalid.
- Template copy is selected by email alias rows from the normalized catalog via `emailCopy()`.
  Workers resolve it from local SQLite (`LOCALIZATION_SQLITE_PATH`); tests and `react-email`
  preview may read the committed tables. Email copy is never fetched over HTTP.
- Authenticated user-backed email enqueue paths should pass the saved
  `user.ui_locale` when they have the user record, such as email verification and
  account data export notifications.
- Do not machine-translate user-authored support message bodies. Only the
  Voucha-owned wrapper copy, default subject lines, signoffs, buttons, and footers
  may vary by UI locale.

## Account Country

- Account country is a user preference and may be used for ranking, defaults, or
  regional product behavior.
- Country does not imply UI locale and must not change root `<html lang>` by
  itself.

## Content Language

- User-generated and crawled content keeps its own language metadata.
- Content surfaces should set `lang` on the smallest practical content container
  using declared language first, then detected language.
- User-authored post titles are content and should carry content `lang`/`dir` on
  title elements. UI-owned fallback labels for empty titles are not content
  language text.
- Content language is ISO 639-1 unless an entity explicitly needs a richer source
  tag for ingest metadata.
- Post author language input is declared content language, not UI locale.
- Plain post titles and reduced post projections use `PostContentText`; it resolves declared
  language before detection and leaves blank-content UI fallbacks unmarked. Rich post content uses
  `MarkdownContent` with the same resolved language.
- APIs that project post titles or markdown retain nullable `declared_language` and
  `lingua_rs_detected_language`; shared API fixtures stage that contract before the linked native
  client change. Swift and .NET apply language and direction at the content leaf.
- Moderation responses keep post/comment authored fragments in `target_content` (and dispute
  post data in `post_content`) rather than marking mixed UI labels. UI prefixes, IDs, privacy
  redactions, query state, ARIA labels, routes, and image text remain unmarked.

## Automatic Translations

- Translations are derived content and must never overwrite original text,
  markdown, HTML, or declared language.
- Translation records must include entity identity, source content hash, source
  language, target language or locale, provider, model or version, status,
  timestamps, and freshness metadata.
- Translation rendering must make the source language and target language
  explicit in code, even if the first UI does not expose a visible label.
- Private or restricted content must not be sent to external translation providers
  unless a product requirement explicitly allows it.

## Local tmux smoke

After `./dev/initialize web`, run `pnpm run test:localization:tmux-smoke`. It starts or reuses the worktree's managed `./dev/tmux` session, probes the live backend localization API, then opens the running local Worker in Chromium for anonymous landing, login, and news states. It uses no localization mock; an unavailable backend or stale catalog revision fails before browser navigation. The runner detects the Worker's active HTTP or HTTPS protocol even when an existing tmux session is reused.

Set `LOCALIZATION_SSR_REVISION_DIAGNOSTIC=1` to also fetch `/`, `/login`, and `/news` from the local Next origin (`http://127.0.0.1:$NEXT_PORT`) after the Worker is ready and Next origin `/` returns 200, and require `data-localization-ssr-revision` on the SSR HTML to match the backend catalog revision. That check isolates Next's in-process route-catalog cache from Worker HTML caching; it is a test-only exception to [traffic routing](../../../dev/reference-traffic-routing.md). Missing or stale markers fail with an instruction to restart the `nextjs` tmux window. The stale-while-revalidate TTL policy is unchanged. Default smoke without that env keeps the English-only, no-browser-error Playwright contract.

The local stack still requires user-local S3 bucket names, including `S3_BUCKET_IMAGES`, in `~/voucha.env`. See [local environment variables](../../development/local-env-vars.md).

## Related

- [Client Parity Matrix](../CLIENT-PARITY-MATRIX.md)
- [Client feature parity contract](../client-feature-parity.json)
- [User Preferences](./PREFERENCES.md)
- [SEO](../seo/SEO.md)
- [Content Rendering](../../overview/architecture/content-rendering.md)
- [Translation Catalog and Locale Checks](../../development/tests.md#translation-catalog-and-locale-checks)
