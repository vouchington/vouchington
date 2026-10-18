import {
  MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS,
  markFollowerDistributionFailed,
  parseSendFollowersInput,
  preflightRssFeedItemDistributionTarget,
  sendRssFeedItemToFollowers,
  shareRssFeedItemWithFollowers,
  type SendFollowersInput,
  type FollowerDistributionAccepted,
} from '@services/follower-distributions'
import { enqueueProcessFollowerDistribution } from '@queues/follower-distributions/enqueues'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { requireActiveToolUser } from './private-user.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { objectSchema } from './output-schema-shapes.mts'

type Args = { rss_feed_item_id: string }
function source(
  send: boolean,
): MergedToolSource<Args & Partial<SendFollowersInput>, FollowerDistributionAccepted> {
  const id = { type: 'string', format: 'uuid' }
  return {
    schema: {
      description: send
        ? 'Send an RSS item to all or selected current followers, at most once per day.'
        : 'Share an RSS item with followers, at most once per day.',
      parameters: send
        ? {
            type: 'object',
            oneOf: [
              {
                type: 'object',
                properties: { rss_feed_item_id: id, audience: { const: 'all_followers' } },
                required: ['rss_feed_item_id', 'audience'],
              },
              {
                type: 'object',
                properties: {
                  rss_feed_item_id: id,
                  audience: { const: 'selected_followers' },
                  recipient_user_ids: {
                    type: 'array',
                    items: id,
                    minItems: 1,
                    maxItems: MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS,
                    uniqueItems: true,
                  },
                },
                required: ['rss_feed_item_id', 'audience', 'recipient_user_ids'],
              },
            ],
          }
        : { type: 'object', properties: { rss_feed_item_id: id }, required: ['rss_feed_item_id'] },
    },
    meta: {
      audience: 'user',
      title: 'Share RSS Feed Item',
      plan: 'plus',
      requiredScopes: ['rss-feed-items:read', 'rss-feed-items:write'],
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      api: [
        {
          method: 'POST',
          path: `/api/v1/rss-feed-items/:rssFeedItemId/${send ? 'sends' : 'shares'}`,
        },
      ],
      outputSchema: objectSchema({ status: { const: 'accepted' }, distribution_id: id }),
    },
    function: currentUser => async (args, invocationContext) => {
      const user = await requireActiveToolUser(currentUser)
      getDelegatedToolAuthority(user, invocationContext)
      const { rss_feed_item_id, ...body } = args
      if (send) await preflightRssFeedItemDistributionTarget(rss_feed_item_id)
      const result = send
        ? await sendRssFeedItemToFollowers(user, rss_feed_item_id, parseSendFollowersInput(body))
        : await shareRssFeedItemWithFollowers(user, rss_feed_item_id)
      try {
        await enqueueProcessFollowerDistribution(result.distribution_id)
      } catch (err) {
        await markFollowerDistributionFailed(
          result.distribution_id,
          'Failed to enqueue follower distribution',
        )
        throw err
      }
      return result
    },
  }
}
export const shareRssFeedItemGroup = {
  name: 'share_rss_feed_item',
  options: [
    { option: 'share', source: source(false) },
    { option: 'send', source: source(true) },
  ],
} as const
export default createMergedTool(
  shareRssFeedItemGroup.name,
  'Share RSS Feed Item',
  shareRssFeedItemGroup.options,
)
