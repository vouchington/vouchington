# Localization

Voucha is one canonical site with multilingual content. UI localization, user country, detected
content language, and translated content are separate concepts. The catalog format, route
selectors, and generators are read from `localization/` and `static-code-analysis/i18n-extract`;
see [Translation Catalog and Locale Checks](../../development/tests.md#translation-catalog-and-locale-checks).

## Canonical URLs

- Do not add locale-prefixed routes such as `/en/*` or `/fr/*`.
- Do not add `hreflang` alternates until translated pages have stable crawlable URLs.
- Canonical URLs remain language-neutral unless a product decision creates first-class translated
  URLs.

## UI Locale

- Root `<html lang>` must describe the actual UI message language being rendered.
- English is the canonical catalog. Other locales are machine-translated and gated by a key-parity
  test against English; native review is a follow-up, not a shipping blocker.
- SSR redirects and 404s must keep their response status, so the initial route renders without an
  outer Suspense boundary.

## Transactional Email Locale

- Voucha-authored templates accept an optional locale and fall back to English when it is absent
  or invalid. Authenticated enqueue paths pass the saved user locale when they have the user.
- Email copy comes from the local catalog, never over HTTP.
- Never machine-translate user-authored support message bodies. Only Voucha-owned wrapper copy,
  default subjects, signoffs, buttons, and footers vary by locale.

## Account Country

Account country is a user preference for ranking, defaults, or regional behavior. It does not imply
UI locale and must not change root `<html lang>` by itself.

## Content Language

- User-generated and crawled content keeps its own language metadata.
- Set `lang` and `dir` on the smallest practical content container, using declared language first
  and detected language second. Post author language input is declared content language, not UI
  locale.
- UI labels, ids, redactions, ARIA labels, routes, and image text stay unmarked. A fallback label
  for an empty title is UI copy, not content.
- Moderation responses keep authored fragments separate from mixed UI labels so only the authored
  text carries content language.

## Automatic Translations

- Translations are derived content and never overwrite original text, markdown, HTML, or declared
  language.
- Translation records identify the entity, source hash, source and target language, provider, and
  freshness, and rendering makes source and target language explicit in code.
- Private or restricted content is not sent to external translation providers unless a product
  requirement explicitly allows it.

## Related

- [Client Parity Matrix](../CLIENT-PARITY-MATRIX.md)
- [User Preferences](./PREFERENCES.md)
- [SEO](../seo/SEO.md)
- [Content Rendering](../../overview/architecture/content-rendering.md)
