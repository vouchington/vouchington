# Podcasts reference

[Back to Podcasts](PODCASTS.md)

## Player Architecture

### Global mini-player (shipped in #5574)

`web/components/feed/podcast-episode-player.tsx` is now a **play-trigger only** — a button
that calls `playEpisode(episode)` from `PodcastPlayerProvider`. The `<audio>` element lives
in the provider.

### Player Provider (`PodcastPlayerProvider`)

Mounted at the root layout inside `SidebarInset` — the persistence boundary that survives
App Router navigation. Exposes:

```ts
{
  currentEpisode: PodcastEpisode | null
  playEpisode(episode: PodcastEpisode): void
  clearEpisode(): void
}
```

The provider owns:

1. **Single `<audio>` element** — controlled by `currentEpisode`; http→https-upgraded `enclosureUrl`.
2. **Global mini-player bar** — `fixed bottom-0`, clickable layout: episode title (left, truncates, `flex-1`) links to source modal (`/podcast-episodes?rss_item=<episodeId>`); podcast title (right, always shown, `max-w-[40%]`) links to show page (`showHref`); cover art links to the same source modal. `<PodcastPlayerSpacer />` in the root layout prevents content being occluded.
3. **Resume**: on episode load (logged-in only), GETs saved position from server; seeks `audio.currentTime` on `loadedmetadata` unless `completed_at` is set (restart from 0).
4. **Position writes**: throttled PUT every ~12 s while playing; flushed on `pause`, `ended`, `pagehide`. `ended` sends `completed: true`.

### Native playback scope

Swift and .NET both use the shared RSS feed-item contract for playable media and the
podcast playback-position endpoint. The delivered native scope is:

- direct podcast audio playback for playable URLs
- direct video playback for playable URLs
- podcast resume position persistence via `/api/v1/podcast-episodes/:id/playback-position`
- episode art prefers `data.thumbnail_url` over `rss_feed.podcast_show.cover_art_url`
- Swift and .NET chapter jump controls from `/api/v1/podcast-episodes/:id/chapters`
- Swift and .NET playback-speed controls
- `is_visible=false` chapter rows are filtered out before either native client renders them

Native clients play direct podcast audio and video URLs natively. For embed-only YouTube and Vimeo
videos, the accepted exception permits one provider-only WebView wrapper because both official
player integrations are iframe-based and arbitrary direct media URLs are unavailable. The wrapper
loads no browser until Play, uses an ephemeral session, loads the validated player URL directly,
blocks unexpected top-level navigation and popups, injects no scripts or bridge, and is destroyed
on dismissal. **Open source** remains a separate action. Link-only audio keeps its external
fallback.

Only HTTPS URLs with no user information or explicit port are playable:
`www.youtube-nocookie.com/embed/…` and `player.vimeo.com/video/…`. PeerTube and unknown providers
remain external-only. See YouTube's [iOS helper documentation](https://developers.google.com/youtube/v3/guides/ios_youtube_helper), Vimeo's [Player SDK](https://developer.vimeo.com/player/sdk), and client issue
[`vouchington/vouchington-clients#57`](https://github.com/vouchington/vouchington-clients/issues/57).

`PodcastEpisode` type (`web/lib/podcast-player/types.ts`) carries:

| Field                                              | Description                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `episodeId`                                        | `rss_feed_item.id` (playback-position persistence key)                                                 |
| `enclosureUrl`, `enclosureType`, `durationSeconds` | Playback data                                                                                          |
| `title`, `showId`, `showTitle`                     | Display data                                                                                           |
| `coverArtUrl?`                                     | Cover art URL (episode-first precedence — see below; may be raw when sourced from the single-item API) |
| `showHref?`                                        | Canonical podcast show page — `topicHref(rss_feed.topic, 'news')`                                      |

### Cover-art source precedence

At every `PodcastEpisode` construction site, cover art must use **episode-first** precedence:

```
rss_feed_item.data.thumbnail_url ?? rss_feed.podcast_show.cover_art_url ?? undefined
```

This ensures the artwork displayed in the mini-player consistently represents the playing episode rather than always showing the generic show art.

### Playback-position persistence

Migration: `backend/data-stores/psql/migrations/0490-00-00-podcast-playback-positions.sql`

Table `podcast_playback_positions` — composite PK `(user_id, rss_feed_item_id)`:

| Column             | Type        | Notes                                             |
| ------------------ | ----------- | ------------------------------------------------- |
| `user_id`          | UUID FK     | References `users(id) ON DELETE CASCADE`          |
| `rss_feed_item_id` | UUID FK     | References `rss_feed_items(id) ON DELETE CASCADE` |
| `position_seconds` | FLOAT       | Current playback offset                           |
| `completed_at`     | TIMESTAMPTZ | Set once when episode ends; NULL if incomplete    |
| `updated_at`       | TIMESTAMPTZ | Auto-updated via trigger                          |

REST contract (`backend/api/v1/podcast-episodes/`):

| Method | Route                                            | Notes                                             |
| ------ | ------------------------------------------------ | ------------------------------------------------- |
| GET    | `/api/v1/podcast-episodes/:id/chapters`          | Public optional auth; returns normalized chapters |
| PUT    | `/api/v1/podcast-episodes/:id/playback-position` | Upsert; body `{position_seconds, completed?}`     |
| GET    | `/api/v1/podcast-episodes/:id/playback-position` | Resume read; returns `{playback_position}`        |

The `:id` param is `rss_feed_item.id` (`PodcastEpisode.episodeId`). The chapters route
returns `[]` when the episode, chapter reference, or chapter JSON is missing or invalid.
The playback-position GET returns `null` when no row exists; the player starts from 0.

### Swift App

The Swift app in
[`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients) targets the
same REST API contract.
`updatePodcastPlaybackPosition`, `podcastPlaybackPosition`, and `podcastEpisodeChapters`
Endpoint factories are defined. The response models live in
`VouchaModels/PodcastPlaybackPosition.swift` and `VouchaModels/PodcastChapter.swift`.
The contract must remain stable so the Swift client needs no update when the contract is already consumed.
See the [Swift client instructions](https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/CLAUDE.md).

`PodcastPlaybackController` owns resume, visible-chapter loading, chapter seeking, and playback
speed. `PodcastMiniPlayerView` renders the chapter and speed controls.

### .NET App

The .NET app consumes the same playback-position and chapter endpoints through
`VouchaApiClient.PodcastPlayback.cs`. `MediaPlaybackPage` renders direct media, resume, visible
chapters, chapter seeking, and playback-speed controls.

`MediaPlaybackPageSourceTests.cs` is an explicitly declared source audit. It verifies that the
XAML and partial page sources remain wired to those controls and endpoints. It does not execute or
prove runtime playback behavior.
