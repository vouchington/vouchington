# User Preferences

**No cookies for layout preferences** — use localStorage for theme, list style, and feed
style. Cookies cause cached pages to vary per-user, breaking CF Worker caching.

Account-level settings such as country, UI locale, and Hacker News discussions are not
localStorage preferences. They are persisted user settings because they affect
cross-device account behavior. See [Localization](./LOCALIZATION.md) for the UI locale,
country, content language, and translation requirements.
