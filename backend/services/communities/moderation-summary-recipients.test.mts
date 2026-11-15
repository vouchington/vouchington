import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { encodeCursor, decodeCursor } from '@modules/pagination'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { communitiesWorkConfig } from './work-limits.mts'
import { getModerationSummaryRecipients } from './moderation-summary-recipients.mts'

const minimum = '00000000-0000-0000-0000-000000000000'

describe('moderation recipient inspected-membership cursor', () => {
  it('advances past an ineligible membership on an empty recipient page', async () => {
    const user = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const restore = overrideDynamicConfigFieldsForTest(communitiesWorkConfig, {
      summary_email_batch_size: 1,
    })
    try {
      const page = await getModerationSummaryRecipients(
        encodeCursor({ id: user.id, communityId: minimum }),
      )
      expect(page.recipients).toEqual([])
      expect(decodeCursor(page.afterId!)).toEqual({ id: user.id, communityId: community.id })
    } finally {
      restore()
    }
  })

  it('deduplicates users within a page and advances through their remaining memberships', async () => {
    const user = await createTestUser()
    const first = await insertTestCommunity({ createdById: user.id })
    const second = await insertTestCommunity({ createdById: user.id })
    const third = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: first.id, userId: user.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: second.id, userId: user.id, role: 'moderator' })
    await insertTestCommunityMember({ communityId: third.id, userId: user.id, role: 'owner' })
    const restore = overrideDynamicConfigFieldsForTest(communitiesWorkConfig, {
      summary_email_batch_size: 2,
    })
    try {
      const page = await getModerationSummaryRecipients(
        encodeCursor({ id: user.id, communityId: minimum }),
      )
      expect(page.recipients.map(row => row.id)).toEqual([user.id])
      expect(decodeCursor(page.afterId!)).toEqual({ id: user.id, communityId: second.id })
      const next = await getModerationSummaryRecipients(page.afterId)
      expect(next.recipients.filter(row => row.id === user.id)).toHaveLength(1)
      expect(next.afterId).not.toBe(page.afterId)
    } finally {
      restore()
    }
  })

  it('rejects obsolete ID-only cursors', async () => {
    await expect(
      getModerationSummaryRecipients(encodeCursor({ id: minimum })),
    ).rejects.toMatchObject({ status: 400 })
  })
})
