import { listCommunityActivityDigestRecipientPage } from '@services/notifications/community-activity-digest-recipients'
import { getNotificationsWorkLimit } from '@services/notifications/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES,
  COMMUNITY_MEMBERSHIP_CAP_MODERATORS,
} from '../seed-data/community-membership-caps.mts'

export async function runCommunityDigestRecipientScenarios(): Promise<void> {
  const digestPageSize = getNotificationsWorkLimit('community_digest_recipient_batch_size')
  registerScenarioContract('community-activity-digest-recipients', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_community_members__active_moderator_user_id',
          'users_pkey',
          'communities_pkey',
        ],
        noSort: true,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'community_members',
        max:
          COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES +
          COMMUNITY_MEMBERSHIP_CAP_MODERATORS +
          digestPageSize,
      },
      { kind: 'maxProcessedRows', relation: 'users', max: digestPageSize + 1 },
      {
        kind: 'maxProcessedRows',
        relation: 'communities',
        max:
          COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES +
          COMMUNITY_MEMBERSHIP_CAP_MODERATORS +
          digestPageSize,
      },
    ],
  })
  await runAndCapture('community-activity-digest-recipients', () =>
    listCommunityActivityDigestRecipientPage(),
  )
}
