import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { readCopyrightRetentionPositiveReportProofProgress } from '@voucha/test-helpers/copyright-retention-positive-report-proof'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { compileEuCopyrightTransparencyReport } from './eu-reporting.mts'
import { purgeCopyrightMinimalRecord } from '@voucha/test-helpers/copyright-minimal-purge'

describe('copyright retention positive report proof', () => {
  useDsaTransparencyReports()
  useCopyrightIntakeEnvironment()
  useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('keeps a positive case proof when an unrelated empty-period report is appended', async () => {
    await setClock(new Date('2029-10-23T00:00:00Z'))
    const reporter = await createTestUser({ extraRoles: ['moderator'] })
    const fixture = await createRetentionMinimalCase({ artifacts: 2 })
    await setClock(new Date('2035-10-23T00:00:00Z'))
    const erasurePages = await advanceCopyrightRetentionWorkPages(fixture.noticeId)
    expect(erasurePages).toContain('erased')

    const positiveNow = new Date('2035-10-23T00:00:00Z')
    const positiveCutoff = new Date('2029-10-23T00:00:00Z')
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2035-10-22T23:59:59Z'),
        cutoff: new Date('2029-10-22T23:59:59Z'),
        maxBatches: 100,
      }),
    ).resolves.toBe('ineligible')

    const beforePage = await readCopyrightRetentionPositiveReportProofProgress(fixture.noticeId)
    expect(beforePage.pending_child_count).toBeGreaterThanOrEqual(4)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: positiveNow,
        cutoff: positiveCutoff,
        pageSize: 1,
        maxBatches: 1,
      }),
    ).resolves.toBe('more')
    const afterPage = await readCopyrightRetentionPositiveReportProofProgress(fixture.noticeId)
    expect(afterPage.phase_index).toBeGreaterThan(0)

    const periodStartedAt = new Date('3000-01-01T00:00:00Z')
    const periodEndedAt = new Date('3001-01-01T00:00:00Z')
    const report = await compileEuCopyrightTransparencyReport(
      reporter,
      periodStartedAt,
      periodEndedAt,
    )
    expect(report.period_started_at).toEqual(periodStartedAt)
    expect(report.period_ended_at).toEqual(periodEndedAt)
    expect([
      report.receipt_count,
      report.statement_of_reasons_count,
      report.redress_request_count,
      report.redress_decision_count,
      report.supervised_complaint_count,
      report.escalation_count,
    ]).toEqual([0, 0, 0, 0, 0, 0])

    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: positiveNow,
        cutoff: positiveCutoff,
        pageSize: 1,
        maxBatches: 1,
      }),
    ).resolves.toBe('more')
    const afterReportPage = await readCopyrightRetentionPositiveReportProofProgress(
      fixture.noticeId,
    )
    expect(afterReportPage.phase_index).toBeGreaterThan(0)
  })
})
