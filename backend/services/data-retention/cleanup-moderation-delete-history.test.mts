import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestModeratorAction,
  insertTestReportJudgement,
} from '@voucha/test-helpers'
import {
  dispatchTestRetentionJudgement,
  resolveTestRetentionCaseForReport,
  resolveTestRetentionReport,
  testModerationRetentionWrite,
} from '@voucha/test-helpers/entities/moderation-retention'
import { deleteExpiredModerationHistory } from './cleanup-moderation-delete-history.mts'

const now = new Date('2026-10-23T12:00:00.000Z')
const expiredAt = new Date('2024-09-01T12:00:00.000Z')
const expiredJudgementAt = new Date('2019-09-01T12:00:00.000Z')

describe('terminal moderation history expiry', () => {
  it('deletes a terminal case only after its report, and expires an old action', async () => {
    const staff = await createTestUser()
    const target = await createTestUser()
    const reportId = await insertTestModerationReport({
      reporterUserId: staff.id,
      entityType: 'user',
      entityId: target.id,
    })
    await resolveTestRetentionReport(reportId, expiredAt)
    const caseId = await resolveTestRetentionCaseForReport(reportId, expiredAt)
    expect(
      await deleteExpiredModerationHistory('cases', testModerationRetentionWrite, [caseId], now),
    ).toBe(0)
    expect(
      await deleteExpiredModerationHistory(
        'reports',
        testModerationRetentionWrite,
        [reportId],
        now,
      ),
    ).toBe(1)
    expect(
      await deleteExpiredModerationHistory('cases', testModerationRetentionWrite, [caseId], now),
    ).toBe(1)

    const oldAction = await insertTestModeratorAction({
      actorId: staff.id,
      actionType: 'pin',
      occurredAt: expiredAt,
    })
    const recentAction = await insertTestModeratorAction({
      actorId: staff.id,
      actionType: 'pin',
    })
    expect(
      await deleteExpiredModerationHistory(
        'actions',
        testModerationRetentionWrite,
        [recentAction.id],
        now,
      ),
    ).toBe(0)
    expect(
      await deleteExpiredModerationHistory(
        'actions',
        testModerationRetentionWrite,
        [oldAction.id],
        now,
      ),
    ).toBe(1)
  })

  it('deletes only a superseded dispatched judgement after six years', async () => {
    const target = await createTestUser()
    const olderId = await insertTestReportJudgement({ entityType: 'user', entityId: target.id })
    await dispatchTestRetentionJudgement(olderId, expiredJudgementAt)
    expect(
      await deleteExpiredModerationHistory(
        'judgements',
        testModerationRetentionWrite,
        [olderId],
        now,
      ),
    ).toBe(0)
    const newerId = await insertTestReportJudgement({ entityType: 'user', entityId: target.id })
    await dispatchTestRetentionJudgement(newerId, expiredJudgementAt)
    expect(
      await deleteExpiredModerationHistory(
        'judgements',
        testModerationRetentionWrite,
        [olderId],
        now,
      ),
    ).toBe(1)
    expect(
      await deleteExpiredModerationHistory(
        'judgements',
        testModerationRetentionWrite,
        [newerId],
        now,
      ),
    ).toBe(0)
  })
})
