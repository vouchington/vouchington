import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import {
  moderationReportsWorkConfig,
  moderationReportsWorkMaxValues,
} from '@services/moderation-reports/work-limits'
import { communitiesWorkConfig, communitiesWorkMaxValues } from '@services/communities/work-limits'
import { adminImportsWorkConfig, adminImportsWorkMaxValues } from '@queues/admin-imports/config'
import {
  followerDistributionsWorkConfig,
  followerDistributionsWorkMaxValues,
} from '@services/follower-distributions/work-limits'
import {
  oauthFacebookWorkConfig,
  oauthFacebookWorkMaxValues,
} from '@services/oauth-facebook/work-limits'

export const backgroundWorkEntries3 = [
  defineBoundedWorkNamespace({
    namespace: 'moderation-reports-work-config',
    config: moderationReportsWorkConfig,
    label: 'Moderation Reports',
    maxValues: moderationReportsWorkMaxValues,
    descriptions: {
      backfill_batch_size: 'Backfill batch size for moderation reports processing.',
      dispatch_batch_size: 'Dispatch batch size for moderation reports processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'communities-work-config',
    config: communitiesWorkConfig,
    label: 'Communities',
    maxValues: communitiesWorkMaxValues,
    descriptions: {
      embedded_first_posts_chunk_size:
        'Embedded first posts chunk size for communities processing.',
      recovery_page_size: 'Recovery page size for communities processing.',
      summary_email_batch_size: 'Summary email batch size for communities processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'admin-imports-work-config',
    config: adminImportsWorkConfig,
    label: 'Admin Imports',
    maxValues: adminImportsWorkMaxValues,
    descriptions: {
      insert_chunk_size: 'Insert chunk size for admin imports processing.',
      enqueue_chunk_size: 'Enqueue chunk size for admin imports processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'follower-distributions-work-config',
    config: followerDistributionsWorkConfig,
    label: 'Follower Distributions',
    maxValues: followerDistributionsWorkMaxValues,
    descriptions: {
      backfill_batch_size: 'Backfill batch size for follower distributions processing.',
      recipient_chunk_size: 'Recipient chunk size for follower distributions processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'oauth-facebook-work-config',
    config: oauthFacebookWorkConfig,
    label: 'Facebook friend updates',
    maxValues: oauthFacebookWorkMaxValues,
    descriptions: {
      friend_mutation_batch_size: 'Friend mutation batch size for oauth facebook processing.',
    },
  }),
]
