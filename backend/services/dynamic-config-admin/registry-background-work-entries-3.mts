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
  defineBoundedWorkNamespace(
    moderationReportsWorkConfig,
    'Moderation Reports',
    moderationReportsWorkMaxValues,
    {
      backfill_batch_size: 'Backfill batch size for moderation reports processing.',
      dispatch_batch_size: 'Dispatch batch size for moderation reports processing.',
    },
  ),
  defineBoundedWorkNamespace(communitiesWorkConfig, 'Communities', communitiesWorkMaxValues, {
    embedded_first_posts_chunk_size: 'Embedded first posts chunk size for communities processing.',
    recovery_page_size: 'Recovery page size for communities processing.',
    summary_email_batch_size: 'Summary email batch size for communities processing.',
  }),
  defineBoundedWorkNamespace(adminImportsWorkConfig, 'Admin Imports', adminImportsWorkMaxValues, {
    insert_chunk_size: 'Insert chunk size for admin imports processing.',
    enqueue_chunk_size: 'Enqueue chunk size for admin imports processing.',
  }),
  defineBoundedWorkNamespace(
    followerDistributionsWorkConfig,
    'Follower Distributions',
    followerDistributionsWorkMaxValues,
    {
      backfill_batch_size: 'Backfill batch size for follower distributions processing.',
      recipient_chunk_size: 'Recipient chunk size for follower distributions processing.',
    },
  ),
  defineBoundedWorkNamespace(
    oauthFacebookWorkConfig,
    'Facebook friend updates',
    oauthFacebookWorkMaxValues,
    {
      friend_mutation_batch_size: 'Friend mutation batch size for oauth facebook processing.',
    },
  ),
]
