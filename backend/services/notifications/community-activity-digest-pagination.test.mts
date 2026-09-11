import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import {
  COMMUNITY_ACTIVITY_DIGEST_RECIPIENT_BATCH_SIZE,
  listCommunityActivityDigestRecipientPage,
} from './community-activity-digest-recipients.mts'

describe('community activity digest recipient pagination', () => {
  it('advances a bounded cursor across 251 eligible recipients', async () => {
    const users = []
    for (let index = 0; index < COMMUNITY_ACTIVITY_DIGEST_RECIPIENT_BATCH_SIZE + 1; index++) {
      const user = await createTestUserDirect()
      const community = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })
      users.push(user)
    }
    const ids = new Set(users.map(user => user!.id))
    const firstId = users.map(user => user!.id).toSorted()[0]!
    const compact = firstId.replaceAll('-', '')
    const previous = (BigInt(`0x${compact}`) - 1n).toString(16).padStart(32, '0')
    const beforeFirst = `${previous.slice(0, 8)}-${previous.slice(8, 12)}-${previous.slice(12, 16)}-${previous.slice(16, 20)}-${previous.slice(20)}`
    const first = await listCommunityActivityDigestRecipientPage(beforeFirst)
    const ownFirst = first.page.filter(row => ids.has(row.user_id))
    const cursor = first.page.at(-1)!.user_id
    const second = await listCommunityActivityDigestRecipientPage(cursor)
    const ownSecond = second.page.filter(row => ids.has(row.user_id))

    expect(first.page).toHaveLength(COMMUNITY_ACTIVITY_DIGEST_RECIPIENT_BATCH_SIZE)
    expect(first.rows.length).toBeLessThanOrEqual(
      COMMUNITY_ACTIVITY_DIGEST_RECIPIENT_BATCH_SIZE + 1,
    )
    expect(new Set([...ownFirst, ...ownSecond].map(row => row.user_id))).toEqual(ids)
  })
})
