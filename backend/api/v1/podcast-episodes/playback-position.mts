import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
  parseJsonBody,
} from '../../response-helpers.mts'
import { upsertPlaybackPosition, getPlaybackPosition } from '@services/podcast-playback-positions'

interface UpsertPlaybackPositionBody {
  position_seconds: number
  completed?: boolean
}

// GET /api/v1/podcast-episodes/:id/playback-position
// Returns the current user's saved position for the episode, or null if none.
// Called once when an episode is loaded into the global player to resume playback.
app.route('/api/v1/podcast-episodes/:id/playback-position').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/podcast-episodes/:id/playback-position')
  validateRequestContract(ctx, 'GET:/api/v1/podcast-episodes/:id/playback-position', {
    path: ctx.params,
  })
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

  const body = await parseJsonBody<UpsertPlaybackPositionBody>(ctx)
  validateRequestContract(ctx, 'PUT:/api/v1/podcast-episodes/:id/playback-position', {
    path: ctx.params,
    body,
  })

  // The contract owns the JSON types; only the numeric range is a semantic 400 (JSON can carry
  // 1e999, which parses to Infinity).
  ctx.assert(
    Number.isFinite(body.position_seconds) &&
      body.position_seconds >= 0 &&
      body.position_seconds < 1_000_000,
    400,
    'position_seconds must be a finite, non-negative number under 1,000,000',
  )

  const completed = body.completed === true

  try {
    await upsertPlaybackPosition(currentUser.id, rssFeedItemId, {
      positionSeconds: body.position_seconds,
      completed,
    })
  } catch (err: unknown) {
    // FK violation: rss_feed_item does not exist
    if ((err as { code?: string }).code === '23503') ctx.throw(404, 'Podcast episode not found')
    throw err
  }

  ctx.setStatus(204)
})
