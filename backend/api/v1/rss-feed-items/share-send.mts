import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS,
  markFollowerDistributionFailed,
  parseSendFollowersInput,
  sendRssFeedItemToFollowers,
  shareRssFeedItemWithFollowers,
} from '@services/follower-distributions'
import { assertNotSuspended } from '@services/users'
import { enqueueProcessFollowerDistribution } from '@queues/follower-distributions/enqueues'
import { requireAuth } from '../../response-helpers.mts'
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

  const result = await shareRssFeedItemWithFollowers(currentUser, ctx.params.rssFeedItemId!)
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
  const input = parseSendFollowersInput(await ctx.request.json('128kb'))
  const result = await sendRssFeedItemToFollowers(currentUser, ctx.params.rssFeedItemId!, input)

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
