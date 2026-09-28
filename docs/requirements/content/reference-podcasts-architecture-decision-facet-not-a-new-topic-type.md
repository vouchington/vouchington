# Podcasts reference

[Back to Podcasts](PODCASTS.md)

## Architecture Decision: Facet, Not a New Topic Type

Podcasts are **not** a new `topic_type`. The [TOPICS.md § Type vs facet](./reference-topics-topic-types.md#type-vs-facet)
rule requires a new type to justify itself with type-specific routing/SEO/UI OR a
type-specific 1:1 extension table with its own validation. Podcasts qualify on both
counts — but the shared `rss_feeds` extension table (URLs, crawls, items, enclosures,
scheduler) already exists and serves podcasts well. Introducing a `topic_type='podcast'`
would orphan or duplicate that infrastructure. Instead:

- Podcasts remain `rss_feeds` rows with `feed_type='podcast'`.
- "First-class" means first-class **routing and UI**, not a new entity type.
- Show page = the existing `/source/[id]` (no SEO duplicate URL).
