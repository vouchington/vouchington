import {
  IMAGE_DELETION_PAGE_JOB,
  IMAGE_DELETION_RECOVER_JOB,
} from '@queues/background/enqueues/image-deletion-jobs'
import { processImageDeletionPage } from '@services/images/delete'
import { processImageDeletionRecovery } from './image-deletion.mts'
import type { BackgroundHandler } from '@queues/background/types'
import { accountLifecycleHandlers } from '@workers/account-lifecycle/workers'
import { activitypubHandlers } from '@workers/activitypub/workers'
import { adminImportsHandlers } from '@workers/admin-imports/workers'
import { articleSyncHandlers } from '@workers/article-sync/workers'
import { cachePurgeHandlers } from '@workers/cache-purge/workers'
import { blueskyFollowPropagationHandlers } from '@workers/bluesky-follow-propagation/workers'
import { entityListenersHandlers } from '@workers/entity-listeners/workers'
import { followerDistributionsHandlers } from '@workers/follower-distributions/workers'
import { emailDigestsHandlers } from '@workers/email-digests/workers'
import { kagiSmallWebHandlers } from '@workers/kagi-smallweb/workers'
import { moderationSignalsHandlers } from '@workers/moderation-signals/workers'
import { notificationsHandlers } from '@workers/notifications/workers'
import { oauthAuthorizationExchangeHandlers } from '@workers/oauth-authorization-exchange/workers'
import { openAiModerationHandlers } from '@workers/openai-moderation/workers'
import { postMentionsHandlers } from '@workers/post-mentions/workers'
import { postPublicationHandlers } from '@workers/post-publication/workers'
import { rssFeedsHandlers } from '@workers/rss-feeds/workers'
import { FEDIVERSE_INSTANCES_CLASSIFY_JOB } from '@queues/background/enqueues/fediverse-instances-jobs'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { classifyCreatedFediverseInstance } from '@services/fediverse-instances/classify-created-instance'
import { sesInboundHandlers } from '@workers/ses-inbound/workers'
import { sitemapsHandlers } from '@workers/sitemaps/workers'
import { storyPostRelatedUrlProjectionsHandlers } from '@workers/story-post-related-url-projections/workers'
import { userRssFeedImportsHandlers } from '@workers/user-rss-feed-imports/workers'
import { urlsDomainsBlacklistHandlers } from '@workers/urls-domains-blacklist/workers'
import { voteAggregationHandlers } from '@workers/vote-aggregation/workers'

/** Every handler of every domain. The registry coverage test keeps this in step with the jobs. */
export const BACKGROUND_HANDLERS: readonly BackgroundHandler[] = [
  backgroundHandler(IMAGE_DELETION_PAGE_JOB, job => processImageDeletionPage(job.data.imageId)),
  backgroundHandler(IMAGE_DELETION_RECOVER_JOB, processImageDeletionRecovery),
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
  ...blueskyFollowPropagationHandlers,
  ...rssFeedsHandlers,
  backgroundHandler(FEDIVERSE_INSTANCES_CLASSIFY_JOB, job => {
    const { topicId, hostnameId } = job.data ?? {}
    if (!topicId || !hostnameId) throw new Error('Fediverse classification job IDs are required')
    return classifyCreatedFediverseInstance(topicId, hostnameId)
  }),
  ...urlsDomainsBlacklistHandlers,
  ...sitemapsHandlers,
  ...cachePurgeHandlers,
  ...kagiSmallWebHandlers,
  ...emailDigestsHandlers,
  ...adminImportsHandlers,
  ...userRssFeedImportsHandlers,
  ...moderationSignalsHandlers,
]
