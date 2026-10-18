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
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import {
  apiNoRequestBody,
  apiRequestContract,
  apiResponse,
  type ApiArrayContract,
} from '@vouchington/utils/api-response-contract'
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
  // A missing item answers 404 before a bad body answers its error, so a body error is held until
  // the service has read the item in its own transaction. The body is read here, before that
  // transaction opens, so a slow client never holds a database connection.
  // ast-grep-ignore: no-three-sequential-awaits -- each step consumes the previous result: the parsed body feeds the send, whose distribution id feeds the enqueue
  const input = await readSendFollowersInput(ctx)
  const result = await sendRssFeedItemToFollowers(currentUser, rssFeedItemId, () => {
    if (input instanceof Error) throw input
    return input
  })

  await enqueueDistributionOrMarkFailed(result.distribution_id)
  ctx.setStatus(202)
  ctx.json(apiResponse('POST:/api/v1/rss-feed-items/:rssFeedItemId/sends', result))
})

async function readSendFollowersInput(
  ctx: Context,
): Promise<ReturnType<typeof parseSendFollowersInput> | Error> {
  try {
    const body = await ctx.request.json('128kb')
    validateRequestContract(ctx, 'POST:/api/v1/rss-feed-items/:rssFeedItemId/sends', { body })
    return parseSendFollowersInput(body)
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}

async function enqueueDistributionOrMarkFailed(distributionId: string) {
  try {
    await enqueueProcessFollowerDistribution(distributionId)
  } catch (err) {
    await markFollowerDistributionFailed(distributionId, 'Failed to enqueue follower distribution')
    throw err
  }
}
