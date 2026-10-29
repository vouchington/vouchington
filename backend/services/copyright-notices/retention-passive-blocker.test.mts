import { describe, expect, it, vi } from 'vitest'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { attemptUnattributedCopyrightReviewerRedress } from '@voucha/test-helpers/copyright-report-retention'
import { createHistoricalCopyrightEuReportCase } from '@voucha/test-helpers/copyright-historical-report-case'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { readCopyrightRetentionMarker } from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { compileEuCopyrightTransparencyReport } from './eu-reporting.mts'

const WORK_PAGE_CAP = 128

describe('copyright retention passive blocker checkpoints', () => {
  useDsaTransparencyReports()
  useCopyrightIntakeEnvironment()
  useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('rebuilds an expired complaint-window proof without an entity or report generation change', async () => {
    const fixture = await createHistoricalCopyrightEuReportCase()
    await compileEuCopyrightTransparencyReport(
      fixture.staff,
      new Date('2500-01-01T00:00:00.000Z'),
      new Date('2501-01-01T00:00:00.000Z'),
    )
    await expect(attemptUnattributedCopyrightReviewerRedress(fixture.noticeId)).rejects.toThrow(
      'Non-notifier copyright redress requires an actor',
    )
    const complaintWindowStillOpen = shiftUtcCalendarMonths(fixture.eventAt, 2)
    await setClock(complaintWindowStillOpen, { caseRetentionMonths: 1 })

    expect(await advanceCopyrightRetentionWorkPages(fixture.noticeId, WORK_PAGE_CAP)).toContain(
      'ineligible',
    )
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.toBeNull()

    // Expire only time-based proof facts. Keep the retention config and all source/report rows fixed.
    const complaintWindowClosed = shiftUtcCalendarMonths(complaintWindowStillOpen, 6)
    vi.setSystemTime(complaintWindowClosed)
    expect(await advanceCopyrightRetentionWorkPages(fixture.noticeId, WORK_PAGE_CAP)).toContain(
      'erased',
    )
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.not.toBeNull()
  })
})
