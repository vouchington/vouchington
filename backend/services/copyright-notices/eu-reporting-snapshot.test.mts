import { beginTransaction } from '@data-stores/psql'
import { createTestUser } from '@voucha/test-helpers'
import { createTestEuNoticeWithOwnedApproval } from '@voucha/test-helpers/copyright-owned-policy-receipt'
import { readEuTransparencyReportMethod } from '@voucha/test-helpers/data-stores/psql/copyright-eu-reports'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import { describe, expect, it } from 'vitest'
import { readEuCopyrightReportCoveragePage } from './eu-report-coverage.mts'
import {
  compileEuCopyrightTransparencyReport,
  readEuCopyrightTransparencyFigures,
} from './eu-reporting.mts'

describe('closed EU report snapshot', () => {
  useDsaTransparencyReports()

  it('keeps global figures and method for the published period', async () => {
    const [administrator, claimant, staff] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const start = new Date(Date.now() - 60_000)
    const { noticeId } = await createTestEuNoticeWithOwnedApproval(administrator, claimant)
    const end = new Date()
    const report = await compileEuCopyrightTransparencyReport(staff, start, end)
    const stored = await readEuTransparencyReportMethod(report.id)
    expect(stored?.method_snapshot).toMatchObject({
      scope: 'all_notices',
      eu_counts_jurisdiction: 'eu_dsa',
      notice_export_jurisdictions: ['us_dmca', 'eu_dsa', 'uk'],
    })
    expect(stored?.figures_snapshot).toMatchObject({
      receipt_count: expect.any(Number),
      notices_received_count: expect.any(Number),
    })
    expect(stored?.reported_at.getTime()).toBeGreaterThanOrEqual(
      stored?.period_ended_at.getTime() ?? Number.POSITIVE_INFINITY,
    )
    await using transaction = await beginTransaction()
    await expect(
      readEuCopyrightReportCoveragePage(transaction, noticeId, 'receipts', null, 1),
    ).resolves.toMatchObject({ covered: true, hasMore: false, nextId: expect.any(String) })
    await transaction.commit()
    const again = await compileEuCopyrightTransparencyReport(staff, start, end)
    expect(again.id).toBe(report.id)
    const published = await readEuCopyrightTransparencyFigures(staff, start, end)
    expect(published.receipt_count).toBe(stored?.figures_snapshot.receipt_count)
  })
})
