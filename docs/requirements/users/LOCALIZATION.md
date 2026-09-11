# Localization

Voucha is one canonical site with multilingual content. UI localization, user
country, detected content language, and translated content are separate concepts.

## Canonical URLs

- Do not add locale-prefixed routes such as `/en/*` or `/fr/*`.
- Do not add `hreflang` alternates until translated pages have stable crawlable
  URLs.
- Canonical URLs remain language-neutral unless a future product decision creates
  first-class translated URLs.

## UI Locale

- Root `<html lang>` must describe the actual UI message language being rendered.
- UI message catalogs (`@ts-shared/ui-messages`) cover `en`, `es`, `fr`, and `pt`
  site-wide. `en` is canonical; `es`/`fr`/`pt` are machine-translated and gated by
  a key-parity test against `en` (`ts-shared/ui-messages/messages/__tests__/parity.test.mts`).
  Native review of the machine-translated copy is a tracked follow-up, not a
  blocker for shipping the catalogs.
- Runtime message loading is chunked by locale namespace. Keep the top-level
  locale files and `messages/<locale>/*.ts` chunk files in sync when adding keys;
  `loadMessages()` assembles the split chunks so hydrated clients avoid loading
  every locale's full catalog at once. This assembly is guarded by a second test,
  `ts-shared/ui-messages/index.test.mts`, which is a separate guard from the
  key-parity test above: it catches split chunks that fail to re-assemble to the
  monolith, not cross-locale key drift. Whenever any file under
  `ts-shared/ui-messages/messages/` changes — especially after rebasing from
  main — run `pnpm run test:ts-shared` before pushing so both guards see the
  change. See [tests.md § Translation Catalog and Locale
  Checks](../../development/tests.md#translation-catalog-and-locale-checks) for
  the full reproduce/recovery detail.
- Catalog logic leaves are serializable `plural` or `select-plural` descriptors. The web
  translator evaluates them with cached `Intl.PluralRules`; the complete web catalog can therefore
  cross the server/client bootstrap boundary without executable-leaf reconstruction. Native-only
  namespaces are tooling inputs, not web runtime data: the native generator explicitly composes
  one canonical web locale with the corresponding native locale modules, while web locale loading
  and hydration never import or serialize `native.*`.
- Native clients consume only paths listed in
  `ts-shared/ui-messages/native-consumer-manifest.mts`. A platform claim is valid only while at
  least one active product source consumes it: Swift app/UI typed references satisfy `swift`;
  C# `UiMessageKey` and MAUI XAML `DynamicResource`/message-format references satisfy `dotnet`.
  Swift discovery accepts typed bare-key shorthand but not unrelated qualified members with the
  same spelling. MAUI XAML discovery parses the document structure, so commented resource
  references never satisfy a product claim.
  Native-only copy is grouped by durable feature under `messages/native-swift/` and
  `messages/native-dotnet/`; their locale composers and tooling-only aggregate entrypoints preserve
  catalog insertion order because generated resources are deterministic.
  Unknown, wrong-platform, and unused claims fail the generator/check. Generated descriptor
  variants (`.__plural.*` and `.__select.*`) belong to their canonical manifest leaf and must not
  be listed separately. Run
  `pnpm run native-localization:check` validates the Filaments producer after manifest/catalog
  changes. Generate and check Swift/.NET outputs from the external native-client checkout boundary
  with `node dev/native-localization.mts --output-root <absolute-client-root> --consumer-root
<absolute-client-root> [--check]`; the exporter rejects stale, missing, extra, or
  placeholder-incompatible output and validates external product usage.
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
      `ts-shared/ui-messages/index.test.mts` (monolith ↔ split assembly) and
      `ts-shared/ui-messages/messages/__tests__/parity.test.mts` (`es`/`fr`/`pt` key parity
      against `en`). Command: `pnpm run test:ts-shared`.
- [ ] **Native generated resources** — manifest/key/descriptor/placeholder parity and deterministic
      Swift/.NET output in the external client checkout. Command:
      `node dev/native-localization.mts --output-root <absolute-client-root> --consumer-root <absolute-client-root> --check`.
- [ ] **Transactional email** — copy parity, not UI catalog parity. Own `resolveUiLocale` in
      `email-templates/locale.mts`. `email-templates/copy-parity.test.mts`,
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

| Consumer                       | Test(s)                                                                                             | Command                                                                                                                | Notes                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI catalogs (source of truth)  | `index.test.mts`, `messages/__tests__/parity.test.mts`                                              | `pnpm run test:ts-shared`                                                                                              | Key/leaf parity only, not translation content.                                                                                                                   |
| Transactional email            | `copy-parity.test.mts`, `locale.test.mts`, per-template `*.test.tsx` snapshots                      | `pnpm run test:email-templates`                                                                                        | Own `resolveUiLocale` in `email-templates/locale.mts`; `copy-registry.mts` **excludes** `crm-outreach-copy.mts` + `renewal-price-increase-copy.mts` (unguarded). |
| Web locale resolution          | `resolve-ui-locale.test.ts`, `get-resolved-ui-locale.mock.test.ts`, `get-translations.mock.test.ts` | `pnpm run test:web`                                                                                                    | `resolveUiLocale`/`getResolvedUiLocale` live in **web**, not backend; backend only threads a `uiLocale` string.                                                  |
| Native resource generation     | `native-resources.test.mts`, `native-resource-export.test.mts`                                      | `node dev/native-localization.mts --output-root <absolute-client-root> --consumer-root <absolute-client-root> --check` | Manifest keys generate locale resources plus typed Swift/.NET key and descriptor accessors in the external client checkout.                                      |
| Swift native (client checkout) | `EmailOTPViewModelTests.swift`, `SettingsViewModelLocaleTests.swift`, core wire tests               | `swift-clients/tooling/with-build-lock.sh swift test --package-path swift-clients/ui` (+ locked `swift-clients/core`)  | `ui_locale` derivation/wire plus generated message-resource consumption.                                                                                         |
| .NET native (client checkout)  | `AuthLocaleTests.cs`, `UiLocalizationTests.cs`, `SettingsViewModel.LocaleActionsTests.cs`           | `dotnet-clients/tooling/with-build-lock.sh dotnet test dotnet-clients/Voucha.DotNet.sln --configuration Release`       | Locale precedence, session/settings refresh, formatting, `ui_locale` wire, and generated message-resource consumption.                                           |

Use this matrix to check a broad localization change (e.g. adding a locale, renaming a catalog
key) across every consumer at once, not just the catalogs.

**Known gaps:**

- `docs/requirements/CLIENT-PARITY-MATRIX.md` has no localization/i18n row.
- `email-templates/copy-registry.mts` intentionally excludes `crm-outreach-copy.mts` and
  `renewal-price-increase-copy.mts` from copy-parity coverage.

## Transactional Email Locale

- Voucha-authored transactional email templates accept an optional `uiLocale` and
  fall back to English through `resolveUiLocale()` when it is absent or invalid.
- Authenticated user-backed email enqueue paths should pass the saved
  `user.ui_locale` when they have the user record, such as email verification and
  account data export notifications.
- Do not machine-translate user-authored CRM or support message bodies. Only the
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

## Related

- [Client Parity Matrix](../CLIENT-PARITY-MATRIX.md)
- [Client feature parity contract](../client-feature-parity.json)
- [User Preferences](./PREFERENCES.md)
- [SEO](../seo/SEO.md)
- [Content Rendering](../../overview/architecture/content-rendering.md)
- [Translation Catalog and Locale Checks](../../development/tests.md#translation-catalog-and-locale-checks)

[#7892]: https://github.com/jonathanong/filaments/issues/7892
