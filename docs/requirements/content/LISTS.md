# Lists

User-curated, personal collections of RSS feed items and posts, private by default.

## Architecture decision: one generic entity, filtered views

A list is a named mixed-media container. Reading, Watch and Listen are filtered views over the
feed item media type, not three entity types, and there is no kind discriminator on the list row.
This mirrors the [podcast decision](./PODCASTS.md#architecture-decision-facet-not-a-new-topic-type)
and avoids three schemas for what is functionally one UI pattern.
