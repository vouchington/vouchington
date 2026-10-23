# Lists

User-curated, personal collections of RSS feed items and posts, private by default.

## Architecture decision: one generic entity, filtered views

A list is a named mixed-media container. Reading, Watch and Listen are filtered views over the
feed item media type, not three entity types, and there is no kind discriminator on the list row.
This mirrors the [podcast decision](./PODCASTS.md#architecture-decision-facet-not-a-new-topic-type)
and avoids three schemas for what is functionally one UI pattern.

## Visibility

Adding a post, and importing posts from a community list, keeps only posts the caller can see.
A post the caller cannot see gets the same response as a post that is not there, so the response
does not reveal that it exists. Reading a list leaves out posts that are no longer visible to
that viewer. An RSS item is added only while the item and its feed are still available.

Community lists bound active RSS feed membership so importing one into a personal list can read
from a fixed number of sources. Feed additions share one serialized cap across REST and MCP; a
full list reports the configured limit for client guidance. Existing lists above a newly lowered
cap stay readable, but further additions wait until enough feeds are removed. Imports select a
deterministic bounded subset of those sources and keep the newest items from each selected feed.
