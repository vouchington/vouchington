import type { BackgroundHandler } from '@queues/background/types'
import { accountLifecycleHandlers } from '@workers/account-lifecycle/workers'
import { activitypubHandlers } from '@workers/activitypub/workers'
import { articleSyncHandlers } from '@workers/article-sync/workers'
import { entityListenersHandlers } from '@workers/entity-listeners/workers'
import { followerDistributionsHandlers } from '@workers/follower-distributions/workers'
import { notificationsHandlers } from '@workers/notifications/workers'
import { oauthAuthorizationExchangeHandlers } from '@workers/oauth-authorization-exchange/workers'
import { openAiModerationHandlers } from '@workers/openai-moderation/workers'
import { postMentionsHandlers } from '@workers/post-mentions/workers'
import { postPublicationHandlers } from '@workers/post-publication/workers'
import { sesInboundHandlers } from '@workers/ses-inbound/workers'
import { storyPostRelatedUrlProjectionsHandlers } from '@workers/story-post-related-url-projections/workers'
import { voteAggregationHandlers } from '@workers/vote-aggregation/workers'

/** Every handler of every domain. The registry coverage test keeps this in step with the jobs. */
export const BACKGROUND_HANDLERS: readonly BackgroundHandler[] = [
  ...sesInboundHandlers,
  ...openAiModerationHandlers,
  ...postMentionsHandlers,
  ...storyPostRelatedUrlProjectionsHandlers,
  ...postPublicationHandlers,
  ...voteAggregationHandlers,
  ...entityListenersHandlers,
  ...accountLifecycleHandlers,
  ...articleSyncHandlers,
  ...oauthAuthorizationExchangeHandlers,
  ...notificationsHandlers,
  ...activitypubHandlers,
  ...followerDistributionsHandlers,
]
