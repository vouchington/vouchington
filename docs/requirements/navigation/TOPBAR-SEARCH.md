# Top Bar

## Home Button

- If logged out, goes to `/`
- If logged in, goes to your feed `/feed/news`

## Inbox

- Logged-in users have an inbox button in the top right of the top bar
- The inbox shows an unread badge when there are unread notifications
- Opening the inbox shows unread notification previews and a `Mark all as read` action
- The inbox links to `/my/notifications`

## Search Input

- `CMD + K` - opens the search
- Clicking search opens the search dialog

## Keyboard Shortcuts

All global keyboard shortcuts — see [KEYBOARD-SHORTCUTS.md](./KEYBOARD-SHORTCUTS.md):

- `⌘K` / `Ctrl+K` — open search
- `⌘/` / `Ctrl+/` — toggle sidebar
- `⌘.` / `Ctrl+.` — open settings (signed-in users only)
- `?` — open keyboard shortcuts help dialog (when not in an input)

## Command Input

- Supports searching for topics and posts, with a preference to topics
- Supports finding pages in the Sidebar (e.g. going to Sources)
- Supports finding settings pages

### Search Filtering

- **Comments are excluded** from search results — only top-level post types appear
- **Post type filter chips** appear above results: All, Discussions, Reviews, Data Points
- Selecting a filter passes `post_types` to the search API to narrow results
- Filter resets when the search dialog closes

### Search Tabs

Tabs filter results by entity type: All, Topics, Communities, Posts, News, Domains, Pages.

- **All**: shows results from all entity types (Topics, Communities, Posts, News, Domains) plus matching Page shortcuts
- **Topics / Communities / Posts / News / Domains**: shows only that entity type; Pages shortcuts are hidden
- **Communities**: shows only community results
- **Pages**: shows only matching Page shortcuts (static navigation links); no API calls are made

For authenticated users, results within each group are sorted so followed or saved items appear first.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/overview/architecture/search.md](../../overview/architecture/search.md)
- [docs/requirements/navigation/ACCESSIBILITY.md](./ACCESSIBILITY.md)
