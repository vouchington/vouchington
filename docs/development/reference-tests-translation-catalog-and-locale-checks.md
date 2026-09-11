# Translation Catalog and Locale Checks

[Back to Tests and Checks](tests.md#translation-catalog-and-locale-checks)

UI message catalogs (`@ts-shared/ui-messages`) are hand-maintained. Native resources are produced
from the typed native-consumer manifest into the separate native-client checkout. These checks
guard the producer contract:

- `ts-shared/ui-messages/index.test.mts` (`loadMessages` block) — monolith ↔ split assembly:
  catches split chunks that fail to re-assemble to the monolithic catalog.
- `ts-shared/ui-messages/messages/__tests__/parity.test.mts` — cross-locale key parity: catches
  `es`/`fr`/`pt` monolith keys missing or extra vs. `en`, and leaf-kind (string vs. serializable
  descriptor) mismatches.
- `ts-shared/ui-messages/native-resources.test.mts`,
  `native-resource-export.test.mts`, and
  `native-consumer-usage.test.mts` — native manifest/catalog validity, CLI generate/check against an
  isolated consumer checkout, real Swift/C#/XAML consumer ownership, placeholder and descriptor
  parity, deterministic output, escaping, and stale/missing/extra file detection. Catalog CLI
  subprocesses use a 30s timeout, matching `index.test.mts` locale assembly.

The catalog and native-resource tests run as the `ts-shared` Vitest project:

```bash
pnpm run test:ts-shared
pnpm run native-localization:check
```

Targeted two-file form, following the [Project Name Reference](reference-project-name-reference.md#project-name-reference) pattern:

```bash
pnpm exec vitest run --project ts-shared ts-shared/ui-messages/index.test.mts ts-shared/ui-messages/messages/__tests__/parity.test.mts
```

After any rebase that touches a file anywhere under `ts-shared/ui-messages/messages/`, **run
`pnpm run test:ts-shared` explicitly.** Two real incidents (PR #7168, PR #7188) shipped catalog
drift a rebase introduced that surfaced only after many pushes. The no-mistakes test planner does
not reliably auto-select these tests for split-chunk-only edits: `index.test.mts` statically
imports only `index.mts` and the four monoliths, and the split chunks are reached solely through a
dynamic `import()` inside `index.mts` that the planner does not trace — a monolith edit selects
both tests, but a split-chunk-only edit can select neither. After changing any file under
`ts-shared/ui-messages/messages/`, run the command above rather than relying on CI to discover it.

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

- `pnpm run test:email-templates` — transactional email copy parity.
- `pnpm run test:web` — web locale resolution (`resolveUiLocale`/`getResolvedUiLocale`).
- From a [vouchington-clients](https://github.com/vouchington/vouchington-clients) checkout,
  `swift-clients/tooling/with-build-lock.sh swift test --package-path swift-clients/ui` (+ the
  equivalent locked `swift-clients/core` command) — Swift `ui_locale` wiring.
- From the same client checkout,
  `dotnet-clients/tooling/with-build-lock.sh dotnet test dotnet-clients/Voucha.DotNet.sln --configuration Release`
  — .NET `ui_locale` wiring.

See also [docs/prompts/scheduled/ui-internationalization.md](../prompts/scheduled/ui-internationalization.md).
