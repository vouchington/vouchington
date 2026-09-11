# Podcast Episodes API

Endpoints for podcast episode playback position persistence.
The `id` parameter is `rss_feed_item.id` (the `PodcastEpisode.episodeId` join key).

## Endpoints

| Method | Route                                            | Auth     | Description                      |
| ------ | ------------------------------------------------ | -------- | -------------------------------- |
| GET    | `/api/v1/podcast-episodes/:id/chapters`          | Optional | Fetch podcast chapter JSON       |
| GET    | `/api/v1/podcast-episodes/:id/playback-position` | Required | Fetch saved position for resume  |
| PUT    | `/api/v1/podcast-episodes/:id/playback-position` | Required | Upsert current playback position |

## GET /api/v1/podcast-episodes/:id/chapters

Fetches chapter JSON for the episode and normalizes it into a capped, sorted chapter list.
Anonymous requests are cached publicly; authenticated requests are rate-limited but not cached.

**Response:** `200 { chapters: { start_seconds: number, end_seconds: number | null, title: string, url: string | null, image_url: string | null, is_visible: boolean }[] }`

- Missing episode rows, missing chapter references, invalid chapter JSON, and unfetchable URLs all return an empty chapter list.
- `toc: false` becomes `is_visible: false`.
- Chapter images are proxied through an absolute `IMAGE_ORIGIN/sideload/` URL when they are valid external image URLs.

## GET /api/v1/podcast-episodes/:id/playback-position

Returns the authenticated user's saved position for the episode. Called once at resume time
when the global player loads a new episode.

**Response:** `200 { playback_position: { position_seconds: number, completed_at: string | null } | null }`

- `playback_position` is `null` when no position has been saved yet; the player starts from 0.
- If `completed_at` is set, the player should also start from 0 (episode was already finished).

## PUT /api/v1/podcast-episodes/:id/playback-position

Upserts the user's playback position. The web client calls this on a ~10–15 s throttle while
playing, and flushes on `pause`, `ended`, and `pagehide`. `completed: true` marks the
episode as finished (`completed_at` is set once and never cleared by subsequent writes).

**Body:** `{ position_seconds: number, completed?: boolean }`
**Response:** `204 No Content`

## Performance

| Endpoint                                             | Round trips | Caching                          | Notes                                                   |
| ---------------------------------------------------- | ----------- | -------------------------------- | ------------------------------------------------------- |
| GET `/api/v1/podcast-episodes/:id/chapters`          | 2-3         | HTTP: anon Cache-Control (short) | Auth check, entity lookup, then chapter fetch/normalize |
| GET `/api/v1/podcast-episodes/:id/playback-position` | 2           | None                             | Auth check + single-row read-replica lookup             |
| PUT `/api/v1/podcast-episodes/:id/playback-position` | 2           | None                             | Auth check + single-row upsert                          |

## Related

- Service: [`backend/services/podcast-playback-positions/`](../../../services/podcast-playback-positions/README.md)
- Migration: [`backend/data-stores/psql/migrations/0490-00-00-podcast-playback-positions.sql`](../../../data-stores/psql/migrations/0490-00-00-podcast-playback-positions.sql)
- Podcast requirements: [`docs/requirements/content/PODCASTS.md`](../../../../docs/requirements/content/PODCASTS.md)
