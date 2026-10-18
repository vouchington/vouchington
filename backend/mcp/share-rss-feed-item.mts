import {
  parseSendFollowersInput,
  sendRssFeedItemToFollowers,
  shareRssFeedItemWithFollowers,
  type SendFollowersInput,
  type FollowerDistributionAccepted,
} from '@services/follower-distributions'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { requireActiveToolUser } from './private-user.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import {
  DISTRIBUTION_OUTPUT_SCHEMA,
  distributionParameters,
  enqueueDistributionOrMarkFailed,
} from './follower-distribution/tool-support.mts'

type Args = { rss_feed_item_id: string }
function source(
  send: boolean,
): MergedToolSource<Args & Partial<SendFollowersInput>, FollowerDistributionAccepted> {
  return {
    schema: {
      description: send
        ? 'Send an RSS item to all or selected current followers, at most once per day.'
        : 'Share an RSS item with followers, at most once per day.',
      parameters: distributionParameters(
        'rss_feed_item_id',
        { type: 'string', format: 'uuid' },
        send,
      ),
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
      outputSchema: DISTRIBUTION_OUTPUT_SCHEMA,
    },
    function: currentUser => async (args, invocationContext) => {
      const user = await requireActiveToolUser(currentUser)
      getDelegatedToolAuthority(user, invocationContext)
      const { rss_feed_item_id, ...body } = args
      return enqueueDistributionOrMarkFailed(
        send
          ? await sendRssFeedItemToFollowers(user, rss_feed_item_id, () =>
              parseSendFollowersInput(body),
            )
          : await shareRssFeedItemWithFollowers(user, rss_feed_item_id),
      )
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
