# User Preferences

**No cookies for layout preferences** — use localStorage for theme, list style, and feed
style. Cookies cause cached pages to vary per-user, breaking CF Worker caching.

Account-level settings such as country, UI locale, and Hacker News discussions are not
localStorage preferences. They are persisted user settings because they affect
cross-device account behavior. See [Localization](./LOCALIZATION.md) for the UI locale,
country, content language, and translation requirements.

## Available Preferences

| Preference      | Key          | Type                            | Default     | Description                                   |
| --------------- | ------------ | ------------------------------- | ----------- | --------------------------------------------- |
| Theme           | `theme`      | `'light' \| 'dark' \| 'system'` | `'dark'`    | Controls the dark/light color scheme          |
| Post List Style | `list-style` | `'card' \| 'compact'`           | `'card'`    | Controls post card layout (full vs condensed) |
| Feed Style      | `feed-style` | `'compact' \| 'summary'`        | `'summary'` | Controls RSS feed item layout                 |

## Persisted user settings

| Setting                 | Field            | Type    | Default | Description                                                                                        |
| ----------------------- | ---------------- | ------- | ------- | -------------------------------------------------------------------------------------------------- |
| Hacker News discussions | `hn_discussions` | boolean | `false` | When on, post and article detail asides fetch related HN threads for linked URLs. Signed-out: off. |

`hn_discussions` is stored on `users`, returned on the private user view, and updated with
`PATCH /api/v1/users/:idOrSlug`. The preferences form writes it the same way privacy toggles
write `third_party_marketing`.

## Architecture

- **`web/lib/preferences/shared.ts`** — Types, key names, defaults, validators (`isValidTheme`, `isValidListStyle`, `isValidFeedStyle`)
- **`web/lib/preferences/storage.ts`** — Client-side localStorage read/write (`getPreference`, `setPreference`)
- **`web/lib/preferences/theme-context.tsx`** — `ThemeProvider` + `useTheme()` hook; applies/removes `.dark` class on `<html>`; reads from localStorage on mount
- **`web/lib/preferences/list-style-context.tsx`** — `ListStyleProvider` + `useListStyle()` hook
- **`web/lib/preferences/feed-style-context.tsx`** — `FeedStyleProvider` + `useFeedStyle()` hook
- **`web/lib/preferences/theme-script.tsx`** — Inline blocking script injected in `<head>` to prevent flash of wrong theme; reads localStorage
- **`web/components/my/hn-discussions-preference.tsx`** — Preferences-page toggle that PATCHes `hn_discussions`

Layout preferences that change SSR-rendered markup, such as list style and feed style, must hydrate
with their default server snapshot first and then sync from localStorage after hydration. Do not read
localStorage from a lazy `useState` initializer for these preferences, because stored non-default
values would make the first client render differ from the server HTML.

## Theme System

- Theme is applied as the `.dark` class on `<html>`. All dark-mode styles use Tailwind's `dark:` prefix.
- The `ThemeScript` runs before paint to set the class immediately, avoiding a flash.
- When theme is `'system'`, a `matchMedia` listener tracks OS color scheme changes in real time.

## Settings Navigation

The settings sidebar (`web/components/my/settings-nav.tsx`) uses a tab-based layout:

| Tab             | Sidebar items                                           |
| --------------- | ------------------------------------------------------- |
| **Account**     | Identity, About Me (`/my/profile`), Privacy, Membership |
| **Preferences** | Preferences, Notifications                              |
| **Profile**     | Cards, Household, Spending, Point Values, Statuses      |
| **Advanced**    | API Keys, Find Friends, Import / Export, Your Data      |

- Tabs are horizontal and scrollable on all viewports (`overflow-x-auto scrollbar-hide` on `TabsList`)
- Active tab is derived from the current pathname; clicking a tab navigates to the first item in that group
- "Landing Pages" is in the global app sidebar, not in the settings sidebar

## Feed Style Views

- **Compact**: Shows title + source badge only. No excerpt.
- **Summary** (default): Shows title, source badge, and excerpt clamped to 3 lines. If the item has full content that differs from the excerpt, a "Show more" button expands it inline.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](./ACCOUNT-DELETION-DATA-REQUEST.md)
