import crypto from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  getTestReleasedModerationTransparencyRollupCount,
  insertTestModerationAppeal,
  insertTestModerationReport,
  insertTestReportIntegrityFlag,
  insertTestPost,
  insertTestPostReview,
  insertTestReleasedModerationTransparencyRollupRow,
  insertTestReviewDispute,
  insertTestTopic,
  insertTestUserWarning,
  resolveTestModerationAppeal,
} from '@voucha/test-helpers'
import {
  getTestRetentionFeedback,
  insertTestRetentionFeedback,
  resolveTestRetentionDispute,
  resolveTestRetentionReport,
  revokeTestRetentionWarning,
  testModerationRetentionWrite,
} from '@voucha/test-helpers/entities/moderation-retention'
import { deleteExpiredModerationHistory } from './cleanup-moderation-delete-history.mts'
import { deleteExpiredModerationSanctions } from './cleanup-moderation-delete-sanctions.mts'
import {
  getTestReportAbusePenaltiesByUserId,
  insertTestReportAbusePenalty,
} from '@voucha/test-helpers/entities/report-integrity'

const now = new Date('2026-10-23T12:00:00.000Z')
const expiredAt = new Date('2024-09-01T12:00:00.000Z')

describe('moderation record retention', () => {
  it('keeps old false-positive feedback after all three source records expire', async () => {
    const staff = await createTestUser()
    const appellant = await createTestUser()
    const postId = await insertTestPost({
      title: `Retention feedback ${crypto.randomUUID()}`,
      slug: `retention-feedback-${crypto.randomUUID()}`,
      createdById: staff.id,
      markdown: 'A review with retained feedback.',
      postType: 'review',
      clearanceStatus: 'in_review',
    })

    const reportId = await insertTestModerationReport({
      reporterUserId: appellant.id,
      entityType: 'post',
      entityId: postId,
    })
    await resolveTestRetentionReport(reportId, expiredAt)

    const warning = await insertTestUserWarning({ userId: appellant.id, issuedById: staff.id })
    const appeal = await insertTestModerationAppeal({
      appellantId: appellant.id,
      userWarningId: warning.id,
    })
    await resolveTestModerationAppeal({
      appealId: appeal.id,
      resolvedAt: expiredAt,
      resolutionAction: 'deny',
    })

    const topicId = await insertTestTopic({
      name: `Retention topic ${crypto.randomUUID()}`,
      slug: `retention-topic-${crypto.randomUUID()}`,
      createdById: staff.id,
    })
    await insertTestPostReview(postId, topicId, 2)
    const disputeId = await insertTestReviewDispute({
      postId,
      topicId,
      disputantUserId: appellant.id,
    })
    await resolveTestRetentionDispute(disputeId, expiredAt)

    const sources = [
      { kind: 'reports', sourceType: 'moderation_report', sourceId: reportId },
      { kind: 'appeals', sourceType: 'moderation_appeal', sourceId: appeal.id },
      { kind: 'disputes', sourceType: 'review_dispute', sourceId: disputeId },
    ] as const
    for (const source of sources) {
      const feedbackId = await insertTestRetentionFeedback({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        postId,
        createdAt: expiredAt,
      })
      expect(
        await deleteExpiredModerationHistory(
          source.kind,
          testModerationRetentionWrite,
          [source.sourceId],
          now,
        ),
      ).toBe(1)
      expect(await getTestRetentionFeedback(feedbackId)).toMatchObject({
        source_type: source.sourceType,
        moderation_report_id: null,
        moderation_appeal_id: null,
        review_dispute_id: null,
      })
      // The old label still suppresses a flagged post and cannot be swept away.
      expect(
        await deleteExpiredModerationHistory(
          'training_feedbacks',
          testModerationRetentionWrite,
          [feedbackId],
          now,
        ),
      ).toBe(0)
    }
  })

  it('preserves an already released aggregate when the source report expires', async () => {
    const reservation = await acquireTestModerationTransparencyDateReservation()
    onTestFinished(() => reservation.release())
    const reporter = await createTestUser()
    const target = await createTestUser()
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: target.id,
      createdAt: reservation.now,
    })
    await resolveTestRetentionReport(reportId, expiredAt)
    await insertTestReleasedModerationTransparencyRollupRow({
      occurredAt: reservation.now,
      metric: 'reports',
      category: 'spam',
      count: 20,
    })

    expect(
      await deleteExpiredModerationHistory(
        'reports',
        testModerationRetentionWrite,
        [reportId],
        now,
      ),
    ).toBe(1)
    expect(
      await getTestReleasedModerationTransparencyRollupCount({
        occurredAt: reservation.now,
        metric: 'reports',
        category: 'spam',
      }),
    ).toBe(20)
  })

  it('keeps active penalties and warnings with live appeal links', async () => {
    const staff = await createTestUser()
    const member = await createTestUser()
    const penaltyId = await insertTestReportAbusePenalty({
      userId: member.id,
      createdById: staff.id,
    })
    expect(
      await deleteExpiredModerationSanctions(
        'report_penalties',
        testModerationRetentionWrite,
        [penaltyId],
        now,
      ),
    ).toBe(0)

    const warning = await insertTestUserWarning({ userId: member.id, issuedById: staff.id })
    await revokeTestRetentionWarning(warning.id, expiredAt)
    const appeal = await insertTestModerationAppeal({
      appellantId: member.id,
      userWarningId: warning.id,
    })
    expect(
      await deleteExpiredModerationSanctions(
        'warnings',
        testModerationRetentionWrite,
        [warning.id],
        now,
      ),
    ).toBe(0)
    await resolveTestModerationAppeal({
      appealId: appeal.id,
      resolvedAt: expiredAt,
      resolutionAction: 'deny',
    })
    expect(
      await deleteExpiredModerationHistory(
        'appeals',
        testModerationRetentionWrite,
        [appeal.id],
        now,
      ),
    ).toBe(1)
    expect(
      await deleteExpiredModerationSanctions(
        'warnings',
        testModerationRetentionWrite,
        [warning.id],
        now,
      ),
    ).toBe(1)
  })

  it('keeps an active penalty after its resolved detection flag expires', async () => {
    const staff = await createTestUser()
    const member = await createTestUser()
    const target = await createTestUser()
    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: target.id,
      resolvedAt: expiredAt,
      resolution: 'penalized',
    })
    const penaltyId = await insertTestReportAbusePenalty({
      userId: member.id,
      createdById: staff.id,
      sourceFlagId: flagId,
    })

    expect(
      await deleteExpiredModerationSanctions(
        'integrity_flags',
        testModerationRetentionWrite,
        [flagId],
        now,
      ),
    ).toBe(1)
    expect(await getTestReportAbusePenaltiesByUserId(member.id)).toContainEqual(
      expect.objectContaining({ id: penaltyId, source_flag_id: null, revoked_at: null }),
    )
  })
})
