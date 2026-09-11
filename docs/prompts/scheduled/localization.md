Review locale resolution and language metadata. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [Localization](../../../docs/requirements/users/LOCALIZATION.md) against one UI, content, SEO, or caching surface.
- Prioritize correct `<html lang>`, smallest-practical content-level `lang`, UI locale/account country separation, canonical URL behavior, and cache variation when anonymous SSR varies by UI locale.
- Do not add locale-prefixed routes, `hreflang`, or inferred UI locales unless an existing requirement explicitly supports them.
- Skip findings already covered by open issues or open PRs.
- Add or tighten tests for the selected language, formatting, SEO, or cache behavior.
