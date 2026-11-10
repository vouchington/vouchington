import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestModerationAppeal,
  insertTestModerationReport,
  insertTestPost,
  insertTestReportJudgement,
  insertTestUserWarning,
} from '@voucha/test-helpers'
import {
  getTestAppealResolutionRunStatus,
  getTestJudgementRunId,
  getTestReportJudgementRunStatus,
  attachTestJudgementToRun,
  insertTestAppealResolutionRunForRetention,
  insertTestReportJudgementRunForRetention,
} from '@voucha/test-helpers/moderation-rerun-retention'
import { runDataRetentionCleanup } from './cleanup.mts'

describe('durable AI rerun retention', () => {
  it('deletes only selected old report runs in bounded pages, including active admissions', async () => {
    const now = new Date()
    const old = new Date(now.getTime() - 100 * 86_400_000)
    const recent = new Date(now.getTime() - 10 * 86_400_000)
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      title: `Rerun retention ${crypto.randomUUID()}`,
      slug: `rerun-retention-${crypto.randomUUID()}`,
      createdById: reporter.id,
      markdown: 'Synthetic moderation report target',
      postType: 'review',
      clearanceStatus: 'in_review',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const selectedActive = await insertTestReportJudgementRunForRetention(reportId, old, 'active')
    const selectedSucceeded = await insertTestReportJudgementRunForRetention(
      reportId,
      old,
      'succeeded',
    )
    const judgementId = await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
    })
    await attachTestJudgementToRun(judgementId, selectedSucceeded)
    const excludedOld = await insertTestReportJudgementRunForRetention(reportId, old, 'expired')
    const selectedRecent = await insertTestReportJudgementRunForRetention(
      reportId,
      recent,
      'active',
    )
    const options = {
      families: ['reportJudgementRuns'] as const,
      reportJudgementRuns: {
        now,
        runIds: [selectedActive, selectedSucceeded, selectedRecent],
      },
    }

    const first = await runDataRetentionCleanup({ batchSize: 1, maxBatches: 1 }, options)
    expect(first.reportJudgementRuns).toEqual({ deleted: 1, hasMore: true })
    const second = await runDataRetentionCleanup({ batchSize: 1, maxBatches: 1 }, options)
    expect(second.reportJudgementRuns.deleted).toBe(1)
    expect(await getTestReportJudgementRunStatus(selectedActive)).toBeNull()
    expect(await getTestReportJudgementRunStatus(selectedSucceeded)).toBeNull()
    expect(await getTestJudgementRunId(judgementId)).toBeNull()
    expect(await getTestReportJudgementRunStatus(excludedOld)).toBe('expired')
    expect(await getTestReportJudgementRunStatus(selectedRecent)).toBe('active')
  })

  it('deletes only selected old appeal runs and preserves an equally eligible excluded run', async () => {
    const now = new Date()
    const old = new Date(now.getTime() - 100 * 86_400_000)
    const recent = new Date(now.getTime() - 10 * 86_400_000)
    const appellant = await createTestUser()
    const warning = await insertTestUserWarning({ userId: appellant.id, issuedById: appellant.id })
    const appeal = await insertTestModerationAppeal({
      appellantId: appellant.id,
      userWarningId: warning.id,
    })
    const selectedSucceeded = await insertTestAppealResolutionRunForRetention(
      appeal.id,
      old,
      'succeeded',
    )
    const excludedOld = await insertTestAppealResolutionRunForRetention(appeal.id, old, 'failed')
    const selectedRecent = await insertTestAppealResolutionRunForRetention(
      appeal.id,
      recent,
      'active',
    )
    const result = await runDataRetentionCleanup(
      { batchSize: 1, maxBatches: 1 },
      {
        families: ['appealResolutionRuns'],
        appealResolutionRuns: {
          now,
          runIds: [selectedSucceeded, selectedRecent],
        },
      },
    )

    expect(result.appealResolutionRuns.deleted).toBe(1)
    expect(await getTestAppealResolutionRunStatus(selectedSucceeded)).toBeNull()
    expect(await getTestAppealResolutionRunStatus(excludedOld)).toBe('failed')
    expect(await getTestAppealResolutionRunStatus(selectedRecent)).toBe('active')
  })
})
