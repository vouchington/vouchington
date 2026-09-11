import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { currentUserCanCreatePost } from '@services/posts/authorization'
import { assertCanContribute } from '@services/contribution-gating/assert'
import { admitRouteContribution, executePreparedContribution } from '@services/contribution-gating'
import { CONTRIBUTION_ADMISSION_IN_PROGRESS } from '@modules/on-error/error-codes'
import { getUserActivePlan } from '@services/memberships'
import { prepareLinkPost } from '@services/posts'
import { assertNotSuspended } from '@services/users'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { apiHeaders } from '../../response-contract.mts'

/**
 * POST /api/v1/rss-feed-items/:id/discussions
 * Creates a link post that directly references the article URL of an RSS feed item.
 *
 * No Turnstile or reCAPTCHA is required here: the action is a one-click server-to-server
 * request with no user-supplied content beyond the pre-validated feed-item URL. The URL is
 * already trusted (stored by the feed ingestion pipeline), so the usual captcha gates that
 * protect free-text submission on POST /api/v1/posts are not necessary.
 */
app.route('/api/v1/rss-feed-items/:id/discussions').post(async (ctx: Context) => {
  apiHeaders('POST:/api/v1/rss-feed-items/:id/discussions', {
    request: { 'Idempotency-Key': { type: 'string', format: 'uuid' } },
    responses: {
      409: {
        headers: { 'Retry-After': { type: 'integer' } },
        errors: [
          {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This Idempotency-Key was already used for a different request.',
          },
          {
            code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
            message: 'This contribution is still being processed. Please retry.',
          },
        ],
      },
      429: {
        errors: [
          {
            code: 'CONTRIBUTION_QUOTA_EXCEEDED',
            message: 'Contribution limit exceeded. Please try again later.',
          },
        ],
      },
    },
  })
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanCreatePost,
    'POST:/api/v1/rss-feed-items/:id/discussions',
  )
  assertNotSuspended(currentUser)

  const itemId = ctx.params.id!
  ctx.assert(isUUID(itemId), 400, 'Invalid RSS feed item ID')

  const membershipPlan = await getUserActivePlan(currentUser.id)
  await assertCanContribute(currentUser, { membershipPlan })
  let item: NonNullable<Awaited<ReturnType<typeof getRssFeedItemById>>> | undefined
  const admission = await admitRouteContribution({
    currentUser,
    membershipPlan,
    source: 'rss_item_discussion',
    scope: `rss_item:${itemId}`,
    postType: 'link',
    idempotencyKeyHeader: ctx.req.headers['idempotency-key'],
    intent: { route: 'rss-feed-items.discussions.create', rss_feed_item_id: itemId },
    beforeCapacity: async () => {
      const resolvedItem = await getRssFeedItemById(itemId, { readOnly: false })
      ctx.assert(resolvedItem, 404, 'RSS feed item not found')
      item = resolvedItem
    },
    execute: query =>
      executePreparedContribution(query, async () => {
        if (!item) throw new Error('RSS feed item admission precondition was not executed')
        const prepared = await prepareLinkPost(
          currentUser,
          { url_id: item.url.id, title: item.data.title },
          { query },
        )
        return {
          response: prepared.response.post,
          finalize: async () => (await prepared.finalize()).post,
        }
      }),
  })
  if (admission.kind === 'in_progress') {
    ctx.set('Retry-After', String(admission.retryAfterSeconds))
    ctx.throw(
      409,
      'This contribution is still being processed. Please retry.',
      CONTRIBUTION_ADMISSION_IN_PROGRESS,
    )
  }
  ctx.json({ post: admission.response })
})
