# Stories

**Related code:** `web/app/(posts)/stories/page.tsx`, `web/components/posts/post-list-page.tsx`
**Component rules:** [docs/requirements/navigation/COMPONENTS.md](../navigation/COMPONENTS.md) — Page Header and Search Input primitives apply to this page.

Stories are first-class entities that group RSS feed items covering the same news event. When multiple outlets publish articles about the same story, the `@story-teller` agent clusters them into a single story with a title, event timestamp, and official source.

## Contents

- <a id="clustering-algorithm-story-metadata-official-items-posts-feed-deduplication-and-admin-management"></a>[Clustering Algorithm, Story Metadata, Official Items, Posts, Feed Deduplication, and Admin Management](reference-stories-clustering-algorithm.md)
- <a id="data-model"></a>[Data Model](reference-stories-data-model.md)
- <a id="api-endpoints-and-related"></a>[API Endpoints and Related](reference-stories-api-endpoints.md)
