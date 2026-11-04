import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { notificationsWorkConfig } from './work-limits.mts'
import { listCommunityActivityDigestRecipientPage } from './community-activity-digest-recipients.mts'

describe('community activity digest recipient pagination', () => {
  it('advances a bounded cursor across owned recipients and excludes an eligible peer', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
        community_digest_recipient_batch_size: 1,
      }),
    )
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    const neighbor = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: first.id })
    await Promise.all(
      [first, second, neighbor].map(user =>
        insertTestCommunityMember({
          communityId: community.id,
          userId: user.id,
          role: 'moderator',
        }),
      ),
    )
    const ids = [first.id, second.id]
    const page = await listCommunityActivityDigestRecipientPage(undefined, undefined, ids, 1)
    expect(page).toEqual({
      rows: [{ user_id: first.id }, { user_id: second.id }],
      page: [{ user_id: first.id }],
    })
    const next = await listCommunityActivityDigestRecipientPage(first.id, undefined, ids, 1)
    expect(next).toEqual({ rows: [{ user_id: second.id }], page: [{ user_id: second.id }] })
    const done = await listCommunityActivityDigestRecipientPage(second.id, undefined, ids, 1)
    expect(done).toEqual({ rows: [], page: [] })
  })
})
