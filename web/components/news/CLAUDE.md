# News Components

Agent rules for [`web/components/news/`](./). Full spec: [NEWS-DISCUSSIONS.md](../../../docs/requirements/content/NEWS-DISCUSSIONS.md).

## Rules

- `NewsDiscussMenu` reads auth from `useAuth()` — do not thread auth through props.
  `data-pw='news-discuss-button'` must render on every branch.
- Cluster "Discuss the full story" CTA, visibility, and 403/409 handling: [news-story-clusters.md](../../../docs/requirements/content/news-story-clusters.md).
- `NewsItemCluster` renders members as bare `NewsItemCard`s with `border-t` — never nested `<Card>`.
- Official-source badge lives in the matching member header, never the story title wrapper.
- Filter the story-post out of `relatedPosts` only inside `NewsItemCluster`.
- Source topic links use `tab='latest'`; category chips keep `tab='news'`.
- Do not pass `hideDownCount` to `ScoreVote` on RSS item surfaces.
- Report lives only in the kebab. Action rows scroll horizontally — never `flex-wrap`.
- RSS item category/tag management is dialog-only.
- Card-level rendering lives in `web/components/feed/news-item-card.tsx`.

## See Also

- [NEWS-DISCUSSIONS.md](../../../docs/requirements/content/NEWS-DISCUSSIONS.md)
- [stories service](../../../backend/services/stories/CLAUDE.md)
