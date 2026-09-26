import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS,
  markFollowerDistributionFailed,
  parseSendFollowersInput,
  sendRssFeedItemToFollowers,
  shareRssFeedItemWithFollowers,
  preflightRssFeedItemDistributionTarget,
} from '@services/follower-distributions'
import { assertNotSuspended } from '@services/users'
import { enqueueProcessFollowerDistribution } from '@queues/follower-distributions/enqueues'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import {
  apiNoRequestBody,
  apiRequestContract,
  apiResponse,
  type ApiArrayContract,
} from '../../response-contract.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'

type SendFollowersRequestContract =
  | { audience: 'all_followers' }
  | {
      audience: 'selected_followers'
      recipient_user_ids: ApiArrayContract<
        ApiUuidContract,
        1,
        typeof MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS,
        true
      >
    }

app.route('/api/v1/rss-feed-items/:rssFeedItemId/shares').post(async (ctx: Context) => {
  apiNoRequestBody('POST:/api/v1/rss-feed-items/:rssFeedItemId/shares')

  const currentUser = await requireAuth(ctx, 'POST:/api/v1/rss-feed-items/:rssFeedItemId/shares')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'POST:/api/v1/rss-feed-items/:rssFeedItemId/shares', {
    path: ctx.params,
  })
  const rssFeedItemId = validateUUIDParam(ctx, 'rssFeedItemId')

  const result = await shareRssFeedItemWithFollowers(currentUser, rssFeedItemId)
  await enqueueDistributionOrMarkFailed(result.distribution_id)
  ctx.setStatus(202)
  ctx.json(apiResponse('POST:/api/v1/rss-feed-items/:rssFeedItemId/shares', result))
})

app.route('/api/v1/rss-feed-items/:rssFeedItemId/sends').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/rss-feed-items/:rssFeedItemId/sends')
  assertNotSuspended(currentUser)

  apiRequestContract<
    'POST:/api/v1/rss-feed-items/:rssFeedItemId/sends',
    SendFollowersRequestContract
  >('POST:/api/v1/rss-feed-items/:rssFeedItemId/sends')
  validateRequestContract(ctx, 'POST:/api/v1/rss-feed-items/:rssFeedItemId/sends', {
    path: ctx.params,
  })
  const rssFeedItemId = validateUUIDParam(ctx, 'rssFeedItemId')
  await preflightRssFeedItemDistributionTarget(rssFeedItemId)
  const body = await ctx.request.json('128kb')
  validateRequestContract(ctx, 'POST:/api/v1/rss-feed-items/:rssFeedItemId/sends', { body })
  const input = parseSendFollowersInput(body)
  const result = await sendRssFeedItemToFollowers(currentUser, rssFeedItemId, input)

  await enqueueDistributionOrMarkFailed(result.distribution_id)
  ctx.setStatus(202)
  ctx.json(apiResponse('POST:/api/v1/rss-feed-items/:rssFeedItemId/sends', result))
})

async function enqueueDistributionOrMarkFailed(distributionId: string) {
  try {
    await enqueueProcessFollowerDistribution(distributionId)
  } catch (error) {
    await markFollowerDistributionFailed(distributionId, 'Failed to enqueue follower distribution')
    throw error
  }
}
