# News components

- Follow [news requirements](../../../docs/requirements/content/NEWS-DISCUSSIONS.md) and [story CTA/visibility/403/409 behavior](../../../docs/requirements/content/news-story-clusters.md).
- `NewsDiscussMenu` reads `useAuth()`, never auth props; every branch renders `data-pw='news-discuss-button'`.
- Cluster members are bare `NewsItemCard`s with `border-t`, never nested Cards. Official-source badges belong in matching member headers, never story-title wrappers.
- Only `NewsItemCluster` filters the story post from `relatedPosts`.
- Source topic links use `latest`; category chips use `news`. RSS ScoreVote never receives `hideDownCount`.
- Report is kebab-only; action rows scroll horizontally without `flex-wrap`; RSS category/tag management is dialog-only.
- Card rendering belongs in `web/components/feed/news-item-card.tsx`; apply [stories service rules](../../../backend/services/stories/AGENTS.md) for creation behavior.
