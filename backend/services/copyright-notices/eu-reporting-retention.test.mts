import { describe, expect, it } from 'vitest'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { createTestUser } from '@voucha/test-helpers'
import { createHistoricalCopyrightEuReportCase } from '@voucha/test-helpers/copyright-historical-report-case'
import { readCopyrightEuTransparencyReports } from '@voucha/test-helpers/copyright-report-retention'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { copyrightNoticeExists } from '@voucha/test-helpers/entities/copyright-minimal-account-clock'
import { compileEuCopyrightTransparencyReport } from './eu-reporting.mts'
import { purgeCopyrightMinimalRecord } from './retention-minimal-purge.mts'

const WORK_PAGE_CAP = 128
const PERIOD_STARTED_AT = new Date('2500-01-01T00:00:00Z')
const PERIOD_ENDED_AT = new Date('2501-01-01T00:00:00Z')

describe('EU transparency report retention', () => {
  useDsaTransparencyReports()
  useCopyrightIntakeEnvironment()
  useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('keeps cumulative reports after purge and rejects an uncompiled overlap', async () => {
    const reporter = await createTestUser({ extraRoles: ['moderator'] })

    const baseline = await compileEuCopyrightTransparencyReport(
      reporter,
      PERIOD_STARTED_AT,
      PERIOD_ENDED_AT,
    )
    const first = await createHistoricalCopyrightEuReportCase()
    const afterFirst = await compileEuCopyrightTransparencyReport(
      reporter,
      PERIOD_STARTED_AT,
      PERIOD_ENDED_AT,
    )
    expect(afterFirst.receipt_count).toBeGreaterThanOrEqual(baseline.receipt_count + 1)
    expect(afterFirst.statement_of_reasons_count).toBeGreaterThanOrEqual(
      baseline.statement_of_reasons_count + 1,
    )
    expect(afterFirst.redress_request_count).toBeGreaterThanOrEqual(
      baseline.redress_request_count + 1,
    )
    expect(afterFirst.redress_decision_count).toBeGreaterThanOrEqual(
      baseline.redress_decision_count + 1,
    )
    expect(afterFirst.supervised_complaint_count).toBeGreaterThanOrEqual(
      baseline.supervised_complaint_count + 1,
    )
    expect(afterFirst.escalation_count).toBeGreaterThanOrEqual(baseline.escalation_count + 1)

    const second = await createHistoricalCopyrightEuReportCase()
    const afterSecond = await compileEuCopyrightTransparencyReport(
      reporter,
      PERIOD_STARTED_AT,
      PERIOD_ENDED_AT,
    )
    for (const count of [
      'receipt_count',
      'statement_of_reasons_count',
      'redress_request_count',
      'redress_decision_count',
      'supervised_complaint_count',
      'escalation_count',
    ] as const)
      expect(afterSecond[count]).toBeGreaterThanOrEqual(afterFirst[count] + 1)

    const retentionNow = shiftUtcCalendarMonths(new Date('2500-01-15T00:00:00Z'), 84)
    const retentionCutoff = shiftUtcCalendarMonths(retentionNow, -72)
    await setClock(retentionNow)
    for (const fixture of [first, second]) {
      expect(await advanceCopyrightRetentionWorkPages(fixture.noticeId, WORK_PAGE_CAP)).toContain(
        'erased',
      )
      await expect(
        purgeCopyrightMinimalRecord(fixture.noticeId, {
          now: retentionNow,
          cutoff: retentionCutoff,
          maxBatches: WORK_PAGE_CAP,
        }),
      ).resolves.toBe('purged')
      await expect(copyrightNoticeExists(fixture.noticeId)).resolves.toBe(false)
    }

    const afterPurge = await compileEuCopyrightTransparencyReport(
      reporter,
      PERIOD_STARTED_AT,
      PERIOD_ENDED_AT,
    )
    for (const count of [
      'receipt_count',
      'statement_of_reasons_count',
      'redress_request_count',
      'redress_decision_count',
      'supervised_complaint_count',
      'escalation_count',
    ] as const)
      expect(afterPurge[count]).toBeGreaterThanOrEqual(afterSecond[count])

    const snapshots = await readCopyrightEuTransparencyReports(PERIOD_STARTED_AT, PERIOD_ENDED_AT)
    const snapshotIds = new Set(snapshots.map(snapshot => snapshot.id))
    for (const report of [baseline, afterFirst, afterSecond, afterPurge])
      expect(snapshotIds.has(report.id)).toBe(true)
    const snapshotsById = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]))
    const previousIds = snapshots.flatMap(snapshot =>
      snapshot.previous_report_id === null ? [] : [snapshot.previous_report_id],
    )
    expect(previousIds.every(id => snapshotsById.has(id))).toBe(true)
    for (const snapshot of snapshots) {
      expect(Object.keys(snapshot.stored_row)).not.toEqual(
        expect.arrayContaining(['notice_id', 'copyright_notice_id', 'receipt_id']),
      )
      expect(snapshot.method_snapshot).toMatchObject({
        version: 2,
        jurisdiction: 'eu_dsa',
        interval: 'start-inclusive-end-exclusive-UTC',
        sourceGeneration: snapshot.source_generation,
      })
      expect(Object.keys(snapshot.method_snapshot).toSorted()).toEqual([
        'facts',
        'interval',
        'jurisdiction',
        'population',
        'previousGeneration',
        'sourceGeneration',
        'version',
      ])
      const retained = JSON.stringify({
        method: snapshot.method_snapshot,
        row: snapshot.stored_row,
      })
      for (const fixture of [first, second]) {
        expect(retained).not.toContain(fixture.noticeId)
        for (const privateValue of fixture.privateValues)
          expect(retained).not.toContain(privateValue)
      }
    }

    const overlappingStart = new Date(PERIOD_STARTED_AT.getTime() + 1)
    const overlappingEnd = new Date(PERIOD_ENDED_AT.getTime() - 1)
    await expect(
      compileEuCopyrightTransparencyReport(reporter, overlappingStart, overlappingEnd),
    ).rejects.toMatchObject({ status: 409 })
  })
})
