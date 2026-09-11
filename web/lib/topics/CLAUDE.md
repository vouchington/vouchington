# Topics display-name utilities

`display-name.ts` exports pure functions for rendering topic names in the UI.

## Rule: always use the display utilities for topic name rendering

`topics.name` stores the full feed URL for uniqueness (e.g. `Title (https://feed.url)`).
**Never render `topic.name` directly in the UI for `rss_feed` topics.**

- **All UI display surfaces** → `getTopicDisplayName(topic, { feedType? })` or `getTopicDisplayTitle(topic)`
- **SEO `<title>` / JSON-LD** → `getTopicDisplayTitle(topic)` (URL-stripped, no kind label)
- **Identity/input surfaces** (autocomplete match key, settings form `defaultValue`, merge-confirm copy) → raw `topic.name` is correct — leave unchanged

The canonical label vocabulary and priority order live in
[TOPICS.md § Topic Aliases, Source Metadata, Categories, Lifecycle States, and Related](../../../docs/requirements/content/TOPICS.md#topic-aliases-source-metadata-categories-lifecycle-states-and-related).

## See also

- Producer: `backend/services/rss-feeds/validate.mts → buildSourceTopicName`
- Entity links: `web/lib/links/CLAUDE.md`
- Topic requirements: [TOPICS.md](../../../docs/requirements/content/TOPICS.md)
