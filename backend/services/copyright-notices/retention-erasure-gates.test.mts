import { createTestUser } from '@voucha/test-helpers'
import {
  createHistoricalCopyrightEuReportCase,
  historicalCopyrightReportPeriod,
} from '@voucha/test-helpers/copyright-historical-report-case'
import { readCopyrightDsaRetentionClock } from '@voucha/test-helpers/copyright-retention-dsa-activity'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import { compileEuCopyrightTransparencyReport } from './eu-reporting.mts'
import { describe, expect, it } from 'vitest'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { insertPreservationHoldForTest } from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import {
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
  recordCopyrightRetentionEvidenceActivity,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { RETENTION_BLOCKERS } from '@voucha/test-helpers/services/copyright-notices/retention-blocked-cases'
import { addLiveGuestCapabilityBlocker } from '@voucha/test-helpers/services/copyright-notices/retention-blockers'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { releasePreservationHoldAt } from '@voucha/test-helpers/services/copyright-notices/retention-preservation-holds'
import { createRetentionTerritorialCase } from '@voucha/test-helpers/services/copyright-notices/retention-territorial-case'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  advanceCopyrightRetentionWorkPages,
  getCopyrightRetentionWorkDate,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { sweepCopyrightEvidenceRetention } from './index.mts'

const WORK_PAGE_CAP = 128
const JANUARY_31 = new Date('2030-01-31T12:00:00.000Z')

describe('copyright evidence retention gates', () => {
  useDsaTransparencyReports()
  const bucket = useFakeCopyrightEvidenceBucket()
  const configure = useCopyrightRetentionConfig()
  const setClock = useCopyrightRetentionWorkClock()

  /** A case with a stored original, and a check that a sweep left every trace of it in place. */
  async function createWatchedCase(activityAt?: Date) {
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const activityTime = activityAt
      ? await recordCopyrightRetentionEvidenceActivity(entry.noticeId, activityAt)
      : null
    return { ...(await watch(entry.noticeId, entry.evidenceKeys[0]!)), activityTime }
  }

  async function watch(noticeId: string, evidenceKey: string) {
    bucket.put(evidenceKey, { versions: 2 })
    const columns = await readCopyrightRetentionColumns(noticeId)
    return {
      noticeId,
      evidenceKey,
      async expectUntouched() {
        expect(bucket.countVersions(evidenceKey)).toBe(2)
        await expect(readCopyrightRetentionColumns(noticeId)).resolves.toEqual(columns)
        await expect(readCopyrightRetentionMarker(noticeId)).resolves.toBeNull()
      },
      async expectErased() {
        expect(bucket.countVersions(evidenceKey)).toBe(0)
        await expect(readCopyrightRetentionColumns(noticeId)).resolves.not.toEqual(columns)
        await expect(readCopyrightRetentionMarker(noticeId)).resolves.not.toBeNull()
      },
    }
  }

  it('does no work while the deletion switch is off', async () => {
    await configure({ evidenceRetentionDeletion: false, caseRetentionMonths: 1 })
    const watched = await createWatchedCase()

    await expect(
      sweepCopyrightEvidenceRetention({
        now: new Date('2040-01-01T00:00:00Z'),
        noticeIds: [watched.noticeId],
      }),
    ).resolves.toMatchObject({ erased: 0, ineligible: 0, progressed: 0, failed: [] })

    await watched.expectUntouched()
    expect(bucket.deleteRequests()).toBe(0)
  })

  it('does not start case erasure while the calendar-month period is unset', async () => {
    await configure({ evidenceRetentionDeletion: true, caseRetentionMonths: 0 })
    const watched = await createWatchedCase()

    const result = await sweepCopyrightEvidenceRetention({
      now: new Date('2040-01-01T00:00:00Z'),
      noticeIds: [watched.noticeId],
    })
    expect(result.erased).toBe(0)
    expect(result.progressed).toBe(0)
    expect(result.failed).toEqual([])
    await watched.expectUntouched()
  })

  it('uses the exact elapsed calendar-month boundary and clamps January 31 to February 28', async () => {
    expect(shiftUtcCalendarMonths(new Date('2030-01-31T12:00:00.000Z'), 1)).toEqual(
      new Date('2030-02-28T12:00:00.000Z'),
    )
    await setClock(JANUARY_31, { caseRetentionMonths: 1 })
    const watched = await createWatchedCase()
    const aggregate = await getCopyrightNoticePrivateAggregate(watched.noticeId)
    expect(aggregate?.lifecycleEvents).toHaveLength(1)
    if (!aggregate?.lifecycleEvents[0]) throw new Error('Retention lifecycle event disappeared')
    const boundary = shiftUtcCalendarMonths(JANUARY_31, 1)

    await setClock(new Date(boundary.getTime() - 1), { caseRetentionMonths: 1 })
    await advanceCopyrightRetentionWorkPages(watched.noticeId, WORK_PAGE_CAP)
    await watched.expectUntouched()

    await setClock(boundary, { caseRetentionMonths: 1 })
    const outcomes = await advanceCopyrightRetentionWorkPages(watched.noticeId, WORK_PAGE_CAP)
    expect(outcomes).toContain('erased')
    await watched.expectErased()
  })

  it('clamps a February 29 event to February 28 after twelve calendar months', async () => {
    const leapDay = new Date('2028-02-29T12:00:00.000Z')
    expect(shiftUtcCalendarMonths(leapDay, 12)).toEqual(new Date('2029-02-28T12:00:00.000Z'))
    await setClock(leapDay, { caseRetentionMonths: 12 })
    const watched = await createWatchedCase()

    await setClock(new Date('2029-02-28T11:59:59.999Z'), { caseRetentionMonths: 12 })
    await advanceCopyrightRetentionWorkPages(watched.noticeId, WORK_PAGE_CAP)
    await watched.expectUntouched()

    await setClock(new Date('2029-02-28T12:00:00.000Z'), { caseRetentionMonths: 12 })
    const outcomes = await advanceCopyrightRetentionWorkPages(watched.noticeId, WORK_PAGE_CAP)
    expect(outcomes).toContain('erased')
    await watched.expectErased()
  })

  it.each(['eu_dsa', 'uk'] as const)(
    'erases a %s case after its calendar-month retention window',
    async jurisdiction => {
      await setClock(new Date(), { caseRetentionMonths: 1 })
      const { noticeId } =
        jurisdiction === 'eu_dsa'
          ? await createHistoricalCopyrightEuReportCase()
          : await createRetentionTerritorialCase(jurisdiction, true)
      if (jurisdiction === 'eu_dsa') {
        const reporter = await createTestUser({ extraRoles: ['moderator'] })
        const period = historicalCopyrightReportPeriod()
        await compileEuCopyrightTransparencyReport(reporter, period.startedAt, period.endedAt)
      }
      const columns = await readCopyrightRetentionColumns(noticeId)

      const { projected_clock: activityAt } = await readCopyrightDsaRetentionClock(noticeId)
      await setClock(new Date(shiftUtcCalendarMonths(activityAt, 1).getTime() + 86_400_000), {
        caseRetentionMonths: 1,
      })
      const outcomes = await advanceCopyrightRetentionWorkPages(noticeId, WORK_PAGE_CAP)
      expect(outcomes).toContain('erased')

      const erased = await readCopyrightRetentionColumns(noticeId)
      expect(erased.copyright_territorial_notice_receipts).not.toEqual(
        columns.copyright_territorial_notice_receipts,
      )
      await expect(readCopyrightRetentionMarker(noticeId)).resolves.not.toBeNull()
    },
  )

  it.each(RETENTION_BLOCKERS.filter(([name]) => name !== 'a live guest capability'))(
    'keeps a case with %s until its blocker ends',
    async (_name, createBlocked) => {
      const fixtureTime = new Date()
      await setClock(fixtureTime, { caseRetentionMonths: 1 })
      const blocked = await createBlocked()
      const watched = await watch(blocked.noticeId, blocked.evidenceKey)
      await setClock(new Date(fixtureTime.getTime() + 45 * 24 * 60 * 60 * 1000), {
        caseRetentionMonths: 1,
      })

      const held = await advanceCopyrightRetentionWorkPages(blocked.noticeId, WORK_PAGE_CAP)
      expect(held).toContain('ineligible')
      await watched.expectUntouched()

      await blocked.release()
      const { projected_clock: releasedAt } = await readCopyrightDsaRetentionClock(blocked.noticeId)
      await setClock(new Date(shiftUtcCalendarMonths(releasedAt, 1).getTime() + 86_400_000), {
        caseRetentionMonths: 1,
      })
      const released = await advanceCopyrightRetentionWorkPages(blocked.noticeId, WORK_PAGE_CAP)
      expect(released).toContain('erased')
      await watched.expectErased()
    },
  )

  it('keeps a capability live when issued on an already-old case', async () => {
    const fixtureTime = new Date()
    await setClock(fixtureTime, { caseRetentionMonths: 1 })
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const watched = await watch(entry.noticeId, entry.evidenceKeys[0]!)
    await setClock(new Date(fixtureTime.getTime() + 45 * 24 * 60 * 60 * 1000), {
      caseRetentionMonths: 1,
    })
    const release = await addLiveGuestCapabilityBlocker(entry)

    const held = await advanceCopyrightRetentionWorkPages(entry.noticeId, WORK_PAGE_CAP)
    expect(held).toContain('ineligible')
    await watched.expectUntouched()

    const revokedAt = new Date()
    await release()
    const boundary = shiftUtcCalendarMonths(revokedAt, 1)
    await setClock(new Date(boundary.getTime() - 1), { caseRetentionMonths: 1 })
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId, WORK_PAGE_CAP)).toContain(
      'ineligible',
    )
    await watched.expectUntouched()
    // Revocation withdraws the planned later expiry; a blocked proof must not retain it as activity.
    await setClock(boundary, { caseRetentionMonths: 1 })
    const released = await advanceCopyrightRetentionWorkPages(entry.noticeId, WORK_PAGE_CAP)
    expect(released).toContain('erased')
    await watched.expectErased()
  })

  it('waits one calendar month from a preservation-hold release', async () => {
    const fixtureTime = new Date()
    await setClock(fixtureTime, { caseRetentionMonths: 1 })
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const watched = await watch(entry.noticeId, entry.evidenceKeys[0]!)
    const holdId = await insertPreservationHoldForTest(entry.posterId, entry.moderator.id)
    await releasePreservationHoldAt(
      holdId,
      entry.moderator.id,
      new Date(fixtureTime.getTime() + 20 * 24 * 60 * 60 * 1000),
    )

    const releaseBoundary = shiftUtcCalendarMonths(
      new Date(fixtureTime.getTime() + 20 * 24 * 60 * 60 * 1000),
      1,
    )
    await setClock(new Date(releaseBoundary.getTime() - 1), { caseRetentionMonths: 1 })
    const before = await advanceCopyrightRetentionWorkPages(entry.noticeId, WORK_PAGE_CAP)
    expect(before).toContain('ineligible')
    await watched.expectUntouched()

    await setClock(releaseBoundary, { caseRetentionMonths: 1 })
    const atBoundary = await advanceCopyrightRetentionWorkPages(entry.noticeId, WORK_PAGE_CAP)
    expect(atBoundary).toContain('erased')
    await watched.expectErased()
  })

  it('shares four configured work pages between maintenance and two owned case pages', async () => {
    const fixtureTime = new Date()
    await setClock(fixtureTime, {
      caseRetentionMonths: 1,
      retentionCaseBatchSize: 2,
      retentionProofMaxPages: 4,
    })
    const watched = await Promise.all([createWatchedCase(), createWatchedCase()])
    const activities = await Promise.all(
      watched.map(async entry => {
        const aggregate = await getCopyrightNoticePrivateAggregate(entry.noticeId)
        const activityAt = aggregate?.notice.received_at
        if (!activityAt) throw new Error('Budget fixture lifecycle event disappeared')
        return activityAt
      }),
    )
    await setClock(
      new Date(
        Math.max(...activities.map(activity => activity.getTime())) + 45 * 24 * 60 * 60 * 1000,
      ),
      {
        caseRetentionMonths: 1,
        retentionCaseBatchSize: 2,
        retentionProofMaxPages: 4,
      },
    )

    const result = await sweepCopyrightEvidenceRetention({
      now: getCopyrightRetentionWorkDate(),
      caseNow: getCopyrightRetentionWorkDate(),
      limit: 2,
      noticeIds: watched.map(entry => entry.noticeId),
    })

    expect(result.progressed).toBe(2)
    expect(result.erased).toBe(0)
    expect(result.failed).toEqual([])
    for (const entry of watched) await entry.expectUntouched()
  })
})
