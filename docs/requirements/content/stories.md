# Stories

**Related code:** `web/app/(posts)/stories/page.tsx`, `web/components/posts/post-list-page.tsx`
**Component rules:** [docs/requirements/navigation/COMPONENTS.md](../navigation/COMPONENTS.md) — Page Header and Search Input primitives apply to this page.

Stories are first-class entities that group RSS feed items covering the same news event. When multiple outlets publish articles about the same story, the story-clustering Choice classifier clusters them into a single story with a title and event timestamp; an admin can set the official source.

The backend link-post service boundary is `createLinkPost(creator, provenance, input, options?)` in `backend/services/posts/create-link-post.mts`. `input` accepts either a resolved `url_id` or a raw `url`, an optional title and optional markdown. With `url_id`, an omitted title falls back to the resolved RSS item, crawl or URL title; with a raw `url`, the service passes an empty title to `createPost`, which applies its own title handling. `options.query` joins an existing transaction. Link posts accept any non-blocked URL and do not use the RSS discoverability gate.

## Contents

- <a id="clustering-algorithm-story-metadata-official-items-posts-feed-deduplication-and-admin-management"></a>[Clustering Algorithm, Story Metadata, Official Items, Posts, Feed Deduplication, and Admin Management](reference-stories-clustering-algorithm.md)
- <a id="data-model"></a>[Data Model](reference-stories-data-model.md)
- <a id="api-endpoints-and-related"></a>[API Endpoints and Related](reference-stories-api-endpoints.md)
