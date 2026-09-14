import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isModerationStaff } from '@services/users'
import { searchPostsForAdminReview } from '@services/post-clearance'
import { createPaginationParser } from '@modules/pagination'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

/**
 * GET /api/v1/posts/review-queue — Paginated list of posts needing global staff review.
 * Returns posts with derived clearance_status IN ('rejected', 'in_review') and a bounded,
 * provider-neutral moderation summary and media reveal metadata for review context.
 */
app.route('/api/v1/posts/review-queue').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isModerationStaff, 'GET:/api/v1/posts/review-queue')

  const { limit, after } = parser.parse(ctx.query)

  ctx.json(await searchPostsForAdminReview({ limit, after }))
})
