Review UI internationalization. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

Unit: one web UI surface.

- Check [Localization](../../requirements/users/LOCALIZATION.md), [`@ts-shared/ui-messages`](../../overview/architecture/typescript-shared/README.md), and one web surface rendering translated chrome: `en` catalog correctness, `es`/`fr`/`pt` key parity, interpolation and plurals, no raw message keys in UI, hydration-safe catalog loading, and locale-safe formatting through shared helpers.
- After any rebase, confirm both catalog load (`ts-shared/ui-messages/index.test.mts`) and key parity (`parity.test.mts`) via `pnpm run test:ts-shared` ([tests.md](../../development/tests.md#translation-catalog-and-locale-checks)).
- Keep user-generated or already-translated content out of catalogs; do not infer UI locales from content languages, account country, or browser-only APIs.
- Boundaries: locale resolution, URLs, and cache behavior are [localization.md](localization.md); generated-content translation is [translation-safety.md](translation-safety.md).
