import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam, parseJsonBody } from '../../response-helpers.mts'
import { upsertPlaybackPosition, getPlaybackPosition } from '@services/podcast-playback-positions'

// GET /api/v1/podcast-episodes/:id/playback-position
// Returns the current user's saved position for the episode, or null if none.
// Called once when an episode is loaded into the global player to resume playback.
app.route('/api/v1/podcast-episodes/:id/playback-position').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/podcast-episodes/:id/playback-position')
  const rssFeedItemId = validateUUIDParam(ctx, 'id')

  const playback_position = await getPlaybackPosition(currentUser.id, rssFeedItemId)

  ctx.json({ playback_position })
})

// PUT /api/v1/podcast-episodes/:id/playback-position
// Upserts the current user's playback position. Called on a ~10–15s throttle while
// playing, and flushed on pause / ended / pagehide. Returns 204.
app.route('/api/v1/podcast-episodes/:id/playback-position').put(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/podcast-episodes/:id/playback-position')
  const rssFeedItemId = validateUUIDParam(ctx, 'id')

  const body = await parseJsonBody<{ position_seconds: unknown; completed?: unknown }>(ctx)

  ctx.assert(
    body !== null &&
      typeof body === 'object' &&
      typeof body.position_seconds === 'number' &&
      Number.isFinite(body.position_seconds) &&
      body.position_seconds >= 0 &&
      body.position_seconds < 1_000_000,
    400,
    'position_seconds must be a finite, non-negative number under 1,000,000',
  )

  const completed = body.completed === true

  try {
    await upsertPlaybackPosition(currentUser.id, rssFeedItemId, {
      positionSeconds: body.position_seconds as number,
      completed,
    })
  } catch (err: unknown) {
    // FK violation: rss_feed_item does not exist
    if ((err as { code?: string }).code === '23503') ctx.throw(404, 'Podcast episode not found')
    throw err
  }

  ctx.setStatus(204)
})
