import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityApplication,
  insertTestCommunityBan,
  insertTestUserModNote,
  suspendTestUserGetId,
} from '@voucha/test-helpers'
import {
  approveTestRetentionApplication,
  deleteTestRetentionNote,
  liftTestRetentionSuspension,
  testModerationRetentionWrite,
} from '@voucha/test-helpers/entities/moderation-retention'
import { insertTestReportAbusePenalty } from '@voucha/test-helpers/entities/report-integrity'
import { insertTestVoteWeightPenaltyRecord } from '@voucha/test-helpers/entities/vote-integrity'
import { deleteExpiredModerationSanctions } from './cleanup-moderation-delete-sanctions.mts'

const now = new Date('2026-10-23T12:00:00.000Z')
const expiredAt = new Date('2024-09-01T12:00:00.000Z')

describe('terminal moderation sanction expiry', () => {
  it('expires terminal sanctions while preserving active ones', async () => {
    const staff = await createTestUser()
    const member = await createTestUser()
    const revokedReportPenalty = await insertTestReportAbusePenalty({
      userId: member.id,
      createdById: staff.id,
      revokedAt: expiredAt,
      revokedById: staff.id,
    })
    const revokedVotePenalty = await insertTestVoteWeightPenaltyRecord({
      userId: member.id,
      createdById: staff.id,
      revokedAt: expiredAt,
      revokedById: staff.id,
    })
    const activeVotePenalty = await insertTestVoteWeightPenaltyRecord({
      userId: member.id,
      createdById: staff.id,
    })
    expect(
      await deleteExpiredModerationSanctions(
        'report_penalties',
        testModerationRetentionWrite,
        [revokedReportPenalty],
        now,
      ),
    ).toBe(1)
    expect(
      await deleteExpiredModerationSanctions(
        'vote_penalties',
        testModerationRetentionWrite,
        [activeVotePenalty],
        now,
      ),
    ).toBe(0)
    expect(
      await deleteExpiredModerationSanctions(
        'vote_penalties',
        testModerationRetentionWrite,
        [revokedVotePenalty],
        now,
      ),
    ).toBe(1)

    const suspensionId = await suspendTestUserGetId(member.id)
    expect(
      await deleteExpiredModerationSanctions(
        'suspensions',
        testModerationRetentionWrite,
        [suspensionId],
        now,
      ),
    ).toBe(0)
    await liftTestRetentionSuspension(suspensionId, expiredAt)
    expect(
      await deleteExpiredModerationSanctions(
        'suspensions',
        testModerationRetentionWrite,
        [suspensionId],
        now,
      ),
    ).toBe(1)

    const community = await insertTestCommunity({ createdById: staff.id })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: member.id,
      bannedById: staff.id,
      liftedAt: expiredAt,
      liftedById: staff.id,
    })
    expect(
      await deleteExpiredModerationSanctions('bans', testModerationRetentionWrite, [ban.id], now),
    ).toBe(1)

    const noteId = await insertTestUserModNote({
      targetUserId: member.id,
      authorUserId: staff.id,
      body: 'Retention note',
    })
    await deleteTestRetentionNote(noteId, expiredAt)
    expect(
      await deleteExpiredModerationSanctions('notes', testModerationRetentionWrite, [noteId], now),
    ).toBe(1)

    const application = await insertTestCommunityApplication({
      communityId: community.id,
      userId: member.id,
    })
    await approveTestRetentionApplication(application.id, expiredAt)
    expect(
      await deleteExpiredModerationSanctions(
        'applications',
        testModerationRetentionWrite,
        [application.id],
        now,
      ),
    ).toBe(1)
  })
})
