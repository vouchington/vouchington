Review locale resolution and language metadata. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

- Check [Localization](../../requirements/users/LOCALIZATION.md) against one UI, content, SEO, or caching surface.
- Prioritize correct `<html lang>`, smallest-practical content-level `lang`, UI locale/account country separation, canonical URL behavior, and cache variation when anonymous SSR varies by UI locale.
- This prompt owns locale resolution, language metadata, canonical URL behavior, and locale-driven cache variation. UI message catalogs and translated chrome belong to [ui-internationalization.md](ui-internationalization.md); generated-content translation lifecycle belongs to [translation-safety.md](translation-safety.md).
- Do not add locale-prefixed routes, `hreflang`, or inferred UI locales unless an existing requirement explicitly supports them.
- Skip findings already covered by open issues or open PRs.
- Add or tighten tests for the selected language, formatting, SEO, or cache behavior.
