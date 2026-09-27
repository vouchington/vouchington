# Feed cards

- Follow [news-card contracts](../../../docs/requirements/content/NEWS-DISCUSSIONS.md#news-item-cards).
- Report appears only in the kebab; Discuss belongs in action-row `NewsDiscussMenu`, never the kebab.
- Summary thumbnails require excerpts and `/sideload/` URLs; video items omit them. `VideoEmbed.thumbnailUrl` is `/sideload/` or undefined, never raw `item.data.thumbnail_url` fallback.
- Header labels/action rows/CategoryChips scroll horizontally, never `flex-wrap`. RSS category management is dialog-only, never full-page tags routes.
- [Podcast players](../../../docs/requirements/content/PODCASTS.md) receive `showHref: topicHref(item.rss_feed.topic, 'latest')`, episode-first `coverArtUrl`, and `episodeId: item.id`.
