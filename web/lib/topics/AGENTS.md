# Topic display names

- Never display raw `topic.name` for RSS-feed topics: stored names contain identity URLs. UI uses `getTopicDisplayName(topic, { feedType? })`/`getTopicDisplayTitle(topic)`; SEO title/JSON-LD uses URL-stripped, kind-free `getTopicDisplayTitle`.
- Identity/input surfaces (autocomplete keys, settings defaults, merge confirmation) retain raw names.
- Vocabulary/priority belongs in [topic requirements](../../../docs/requirements/content/TOPICS.md#topic-aliases-source-metadata-categories-lifecycle-states-and-related). Producer is `backend/services/rss-feeds/validate.mts` → `buildSourceTopicName`; use [entity link rules](../links/AGENTS.md).
