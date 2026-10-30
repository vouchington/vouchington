import { describe, expect, it } from 'vitest'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { useCopyrightRetentionWorkClock } from '@voucha/test-helpers/copyright-retention-work'
import { cleanupCopyrightMinimalRecords } from '../data-retention/cleanup-copyright-minimal-records.mts'
import { purgeCopyrightMinimalRecord } from '@voucha/test-helpers/copyright-minimal-purge'
import { sweepCopyrightEvidenceRetention } from './retention-erasure.mts'

const ISSUED_AT = new Date()
const SIX_YEARS_LATER = shiftUtcCalendarMonths(ISSUED_AT, 72)

describe('copyright retention request boundaries', () => {
  useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('rejects oversized scoped evidence selection without changing the owned case', async () => {
    await setClock(ISSUED_AT)
    const fixtures = await Promise.all([createRetentionMinimalCase(), createRetentionMinimalCase()])
    const before = await Promise.all(
      fixtures.map(fixture => readCopyrightRetentionColumns(fixture.noticeId)),
    )
    await expect(
      sweepCopyrightEvidenceRetention({
        limit: 1,
        noticeIds: fixtures.map(fixture => fixture.noticeId),
      }),
    ).rejects.toThrow('Scoped copyright erasure exceeds one page')
    for (const [index, fixture] of fixtures.entries()) {
      await expect(readCopyrightRetentionColumns(fixture.noticeId)).resolves.toEqual(before[index])
      await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.toBeNull()
    }
  })

  it('rejects invalid sweep, child-page and cleanup limits before deleting evidence', async () => {
    await setClock(ISSUED_AT)
    const fixture = await createRetentionMinimalCase()
    const before = await readCopyrightRetentionColumns(fixture.noticeId)
    await expect(
      sweepCopyrightEvidenceRetention({ limit: 0, noticeIds: [fixture.noticeId] }),
    ).rejects.toThrow('positive case cap')
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: ISSUED_AT,
        cutoff: shiftUtcCalendarMonths(ISSUED_AT, -72),
        pageSize: 0,
      }),
    ).rejects.toThrow('finite positive page limits')
    await expect(
      cleanupCopyrightMinimalRecords(
        { batchSize: 0, maxBatches: 1 },
        {
          now: ISSUED_AT,
          noticeIds: [fixture.noticeId],
        },
      ),
    ).rejects.toThrow('positive retention limits')
    await expect(readCopyrightRetentionColumns(fixture.noticeId)).resolves.toEqual(before)
  })

  it('cannot use a caller-supplied future time to purge an owned case early', async () => {
    await setClock(ISSUED_AT)
    const fixture = await createRetentionMinimalCase()
    const before = await readCopyrightRetentionColumns(fixture.noticeId)
    await expect(
      cleanupCopyrightMinimalRecords(
        { batchSize: 1, maxBatches: 1 },
        {
          now: SIX_YEARS_LATER,
          noticeIds: [fixture.noticeId],
        },
      ),
    ).resolves.toMatchObject({ purged: 0, ineligible: 1, failed: [] })
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: ISSUED_AT,
        cutoff: shiftUtcCalendarMonths(ISSUED_AT, -72),
        maxBatches: 128,
      }),
    ).resolves.toBe('ineligible')
    const sweep = await sweepCopyrightEvidenceRetention({
      now: SIX_YEARS_LATER,
      limit: 1,
      noticeIds: [fixture.noticeId],
    })
    expect(sweep.erased).toBe(0)
    expect(sweep.failed).toEqual([])
    expect(sweep.progressed + sweep.ineligible).toBe(1)
    await expect(readCopyrightRetentionColumns(fixture.noticeId)).resolves.toEqual(before)
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.toBeNull()
  })

  it('keeps an aged case ineligible until evidence erasure has actually completed', async () => {
    await setClock(ISSUED_AT)
    const fixture = await createRetentionMinimalCase()
    const before = await readCopyrightRetentionColumns(fixture.noticeId)
    await setClock(SIX_YEARS_LATER)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: SIX_YEARS_LATER,
        cutoff: ISSUED_AT,
        maxBatches: 128,
      }),
    ).resolves.toBe('ineligible')
    await expect(
      cleanupCopyrightMinimalRecords(
        { batchSize: 1, maxBatches: 1 },
        {
          now: SIX_YEARS_LATER,
          noticeIds: [fixture.noticeId],
        },
      ),
    ).resolves.toMatchObject({ purged: 0, ineligible: 1, failed: [] })
    await expect(readCopyrightRetentionColumns(fixture.noticeId)).resolves.toEqual(before)
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.toBeNull()
  })

  it('does not schedule minimal purge while the retention period is unset', async () => {
    await setClock(ISSUED_AT, { caseRetentionMonths: 0 })
    const fixture = await createRetentionMinimalCase()
    const before = await readCopyrightRetentionColumns(fixture.noticeId)
    await expect(
      cleanupCopyrightMinimalRecords(
        { batchSize: 1, maxBatches: 1 },
        {
          now: SIX_YEARS_LATER,
          noticeIds: [fixture.noticeId],
        },
      ),
    ).resolves.toEqual({
      purged: 0,
      progressed: 0,
      ineligible: 0,
      retainedIdentitiesDeleted: 0,
      hasMore: false,
      failed: [],
    })
    await expect(readCopyrightRetentionColumns(fixture.noticeId)).resolves.toEqual(before)
  })
})
