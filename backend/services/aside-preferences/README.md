# Aside Preferences Service

Manages server-side persistence of user aside dismiss preferences. When a signed-in user dismisses a sidebar aside widget, the preference is stored in `user_aside_preferences` so it persists across devices and sessions.

## Data model

`user_aside_preferences` — one row per (user, aside_key) pair:

- `aside_key` — string identifier matching each aside widget (e.g. `"trending-topics"`, `"connect-social"`)
- `dismissed_at` — when the user last dismissed this aside

## Functions

- `getDismissedAsides(userId)` → `Set<string>` — used by RSC wrappers to determine initial aside visibility
- `dismissAside(userId, asideKey)` → upserts a preference row
- `restoreAside(userId, asideKey)` → deletes the preference row (re-shows the aside)
- `listAsidePreferences(userId)` → returns all dismissed asides with metadata, used by the settings page
