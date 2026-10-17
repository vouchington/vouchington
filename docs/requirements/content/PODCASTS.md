# Podcasts

## Architecture decision: facet, not a new topic type

Podcasts are not a new `topic_type`. They qualify under the [type-vs-facet rule](./TOPICS.md#type-vs-facet),
but the shared `rss_feeds` extension (URLs, crawls, items, enclosures, scheduler) already exists and
serves podcasts well. A podcast topic type would orphan or duplicate that infrastructure.

- Podcasts remain `rss_feeds` rows with `feed_type='podcast'`.
- "First-class" means first-class routing and UI, not a new entity type.
- The show page is the existing source page, so there is no duplicate SEO URL.
