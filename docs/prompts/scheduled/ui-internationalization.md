Review UI internationalization. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [Localization](../../../docs/requirements/users/LOCALIZATION.md), [`@ts-shared/ui-messages`](../../../ts-shared/README.md), and one web UI surface that renders translated chrome.
- Prioritize `en` catalog correctness, `es`/`fr`/`pt` key parity, interpolation/pluralization, avoiding raw message keys in UI, hydration-safe catalog loading, and locale-safe formatting through shared helpers.
- After any rebase, require both monolithic-catalog-to-split-chunk assembly (`ts-shared/ui-messages/index.test.mts`) and `en`/`es`/`fr`/`pt` key parity (`ts-shared/ui-messages/messages/__tests__/parity.test.mts`) to be confirmed via `pnpm run test:ts-shared` before treating the work as done — these are two distinct guards, not one. See [tests.md § Translation Catalog and Locale Checks](../../development/tests.md#translation-catalog-and-locale-checks).
- Keep user-generated or already-translated content out of UI message catalogs.
- Do not infer supported UI locales from content languages, account country, or browser-only locale APIs.
- Add or tighten focused catalog, web component, or formatting tests for the selected UI internationalization behavior.
