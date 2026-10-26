import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestDirectMessage,
  insertTestCommunity,
  insertTestModerationReport,
} from '@voucha/test-helpers'
import {
  resolveTestRetentionReport,
  testModerationRetentionWrite,
} from '@voucha/test-helpers/entities/moderation-retention'
import {
  endTestRetentionDiscussion,
  getTestRetentionDiscussionMessage,
  insertTestRetentionDiscussion,
} from '@voucha/test-helpers/entities/moderation-retention-discussions'
import { deleteExpiredModerationHistory } from './cleanup-moderation-delete-history.mts'

const now = new Date('2026-10-23T12:00:00.000Z')
const expiredAt = new Date('2024-09-01T12:00:00.000Z')

describe('report retention with moderator discussions', () => {
  it.each(['resolved', 'deleted'] as const)(
    'keeps the report and recent reply until the discussion is %s',
    async state => {
      const staff = await createTestUser()
      const target = await createTestUser()
      const community = await insertTestCommunity({ createdById: staff.id })
      const reportId = await insertTestModerationReport({
        reporterUserId: staff.id,
        entityType: 'user',
        entityId: target.id,
        communityId: community.id,
      })
      await resolveTestRetentionReport(reportId, expiredAt)
      const conversationId = await insertTestRetentionDiscussion({
        reportId,
        communityId: community.id,
        authorId: staff.id,
      })
      const message = await createTestDirectMessage({
        conversationId,
        createdById: staff.id,
        bodyText: 'This reviewed report still needs moderator discussion.',
      })
      expect(
        await deleteExpiredModerationHistory(
          'reports',
          testModerationRetentionWrite,
          [reportId],
          now,
        ),
      ).toBe(0)
      expect(await getTestRetentionDiscussionMessage(conversationId, message.id)).toMatchObject({
        moderation_report_id: reportId,
        body_text: 'This reviewed report still needs moderator discussion.',
      })
      await endTestRetentionDiscussion(conversationId, state)
      expect(
        await deleteExpiredModerationHistory(
          'reports',
          testModerationRetentionWrite,
          [reportId],
          now,
        ),
      ).toBe(1)
    },
  )
})
