import { read } from '@data-stores/psql'
import { createTestUser } from '@voucha/test-helpers'
import { createTestTimedDsaReportAction } from '@voucha/test-helpers/dsa-report-timed-action'
import { readEuTransparencyReportMethod } from '@voucha/test-helpers/data-stores/psql/copyright-eu-reports'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import sql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'
import { readDsaCopyrightNoticeFigures } from './eu-reporting-notices.mts'
import {
  compileEuCopyrightTransparencyReport,
  readEuCopyrightTransparencyFigures,
} from './eu-reporting.mts'

/** A unique period that ended at least three days ago, so the one-day grace has passed. */
function closedPeriod(): { start: Date; end: Date } {
  const offset = Number.parseInt(crypto.randomUUID().slice(0, 8), 16) % 3_600_000
  const start = new Date(Date.now() - 4 * 86_400_000 - offset)
  return { start, end: new Date(start.getTime() + 30_000) }
}

describe('closed EU report snapshot', () => {
  useDsaTransparencyReports()

  it('keeps global figures and method for the published period', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const { start, end } = closedPeriod()
    const report = await compileEuCopyrightTransparencyReport(staff, start, end)
    const stored = await readEuTransparencyReportMethod(report.id)
    expect(stored?.method_snapshot).toMatchObject({
      scope: 'all_notices',
      eu_counts_jurisdiction: 'eu_dsa',
      counted_at: 'when Voucha recorded the fact, from its UUIDv7 id',
      notice_export_jurisdictions: ['us_dmca', 'eu_dsa', 'uk'],
    })
    expect(stored?.figures_snapshot).toMatchObject({ receipt_count: 0, notices_received_count: 0 })
    expect(stored?.reported_at.getTime()).toBeGreaterThanOrEqual(
      stored?.period_ended_at.getTime() ?? Number.POSITIVE_INFINITY,
    )
    const again = await compileEuCopyrightTransparencyReport(staff, start, end)
    expect(again.id).toBe(report.id)
    const published = await readEuCopyrightTransparencyFigures(staff, start, end)
    expect(published.receipt_count).toBe(0)
  })

  it('rejects a period that ended less than a day ago', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const end = new Date(Date.now() - 3_600_000)
    await expect(
      compileEuCopyrightTransparencyReport(staff, new Date(end.getTime() - 1_000), end),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('counts a late fact when Voucha recorded it and never changes a stored report', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const { start, end } = closedPeriod()
    const report = await compileEuCopyrightTransparencyReport(staff, start, end)
    const noticeId = await createTestTimedDsaReportAction({
      receivedAt: new Date(start.getTime() + 1_000),
      imposedAt: new Date(start.getTime() + 2_000),
      completedAt: new Date(start.getTime() + 3_000),
    })
    const { rows } = await read<{ recorded_at: Date }>(sql`/* readRecordedNoticeTime */
      SELECT uuid_extract_timestamp(id) AS recorded_at FROM copyright_notices WHERE id = ${noticeId}`)
    const recordedAt = rows[0]?.recorded_at ?? end
    const [arrival, recorded] = await Promise.all([
      readDsaCopyrightNoticeFigures(start, end, [noticeId]),
      readDsaCopyrightNoticeFigures(recordedAt, new Date(recordedAt.getTime() + 1), [noticeId]),
    ])
    expect(arrival.notices_received_count).toBe(0)
    expect(recorded.notices_received_count).toBe(1)
    const again = await compileEuCopyrightTransparencyReport(staff, start, end)
    expect(again.id).toBe(report.id)
    const published = await readEuCopyrightTransparencyFigures(staff, start, end)
    expect(published.notices_received_count).toBe(0)
  })

  it('publishes one immutable report for concurrent compilers of the same period', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const { start, end } = closedPeriod()
    const reports = await Promise.all([
      compileEuCopyrightTransparencyReport(staff, start, end),
      compileEuCopyrightTransparencyReport(staff, start, end),
      compileEuCopyrightTransparencyReport(staff, start, end),
    ])
    expect(new Set(reports.map(report => report.id)).size).toBe(1)
  })
})
