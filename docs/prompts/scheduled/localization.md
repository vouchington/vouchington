Review locale resolution and language metadata. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

Unit: one locale surface (UI, content, SEO, or cache).

- Check [Localization](../../requirements/users/LOCALIZATION.md) against one UI, content, SEO, or caching surface: `<html lang>`, smallest-practical content-level `lang`, UI locale vs account country, canonical URLs, and cache variation when anonymous SSR varies by UI locale.
- Boundaries: UI catalogs and translated chrome belong to [ui-internationalization.md](ui-internationalization.md); generated-content translation to [translation-safety.md](translation-safety.md).
- Do not add locale-prefixed routes, `hreflang`, or inferred UI locales without an explicit requirement.
