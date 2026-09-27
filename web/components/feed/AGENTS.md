# Feed Components

Agent rules for [`web/components/feed/`](./). Layout contracts and call-site narrative live in
[NEWS-DISCUSSIONS.md § News Item Cards](../../../docs/requirements/content/NEWS-DISCUSSIONS.md#news-item-cards).

## Rules

- Report lives only in the card kebab, never as a standalone action-row button. Discuss lives in
  `NewsDiscussMenu` in the action row, not the kebab.
- Never render a summary thumbnail without an excerpt. `thumbnailUrl` must already be a `/sideload/`
  URL. Omit the thumbnail for video items.
- `VideoEmbed` `thumbnailUrl` is a `/sideload/` URL or `undefined` — do not fall back to
  `item.data.thumbnail_url`.
- Header labels, action rows, and `CategoryChips` scroll horizontally — never `flex-wrap`.
- RSS item category management is dialog-only. Do not add a full-page tags route.

## Podcast Player

Follow [PODCASTS.md](../../../docs/requirements/content/PODCASTS.md). Call sites must supply
`showHref: topicHref(item.rss_feed.topic, 'latest')`, episode-first `coverArtUrl`, and
`episodeId: item.id`.

## See Also

- [NEWS-DISCUSSIONS.md](../../../docs/requirements/content/NEWS-DISCUSSIONS.md)
- [PODCASTS.md](../../../docs/requirements/content/PODCASTS.md)
