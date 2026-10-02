import { describe, expect, it } from 'vitest'
import { insertPreservationHoldForTest } from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import {
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { RETENTION_BLOCKERS } from '@voucha/test-helpers/services/copyright-notices/retention-blocked-cases'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { releasePreservationHoldAt } from '@voucha/test-helpers/services/copyright-notices/retention-preservation-holds'
import { createRetentionTerritorialCase } from '@voucha/test-helpers/services/copyright-notices/retention-territorial-case'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { sweepCopyrightEvidenceRetention } from './index.mts'

const DAY_MS = 24 * 60 * 60 * 1000
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright evidence retention gates', () => {
  const bucket = useFakeCopyrightEvidenceBucket()
  const configure = useCopyrightRetentionConfig()

  /** A case with a stored original, and a check that a sweep left every trace of it in place. */
  async function createWatchedCase() {
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    return watch(entry.noticeId, entry.evidenceKeys[0]!)
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

  const nothing = { erased: 0, ineligible: 0, failed: [] }

  it('deletes nothing while the switch is off, even with a period set and the clock run out', async () => {
    await configure({ evidenceRetentionDeletion: false, evidenceRetentionDays: 30 })
    const watched = await createWatchedCase()

    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(400), noticeIds: [watched.noticeId] }),
    ).resolves.toEqual(nothing)

    await watched.expectUntouched()
    expect(bucket.deleteRequests()).toBe(0)
  })

  it('deletes nothing while the period is unset, even with the switch on', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 0 })
    const watched = await createWatchedCase()

    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(400), noticeIds: [watched.noticeId] }),
    ).resolves.toEqual(nothing)

    await watched.expectUntouched()
    expect(bucket.deleteRequests()).toBe(0)
  })

  it('waits for the period to run out from the case clock, then erases', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const watched = await createWatchedCase()
    const noticeIds = [watched.noticeId]

    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(10), noticeIds }),
    ).resolves.toEqual(nothing)
    await watched.expectUntouched()

    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(40), noticeIds }),
    ).resolves.toEqual({
      erased: 1,
      ineligible: 0,
      failed: [],
    })
    await watched.expectErased()
  })

  it.each(['eu_dsa', 'uk'] as const)(
    'keeps a %s case: only US DMCA cases are covered',
    async jurisdiction => {
      await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
      const { noticeId } = await createRetentionTerritorialCase(jurisdiction)
      const columns = await readCopyrightRetentionColumns(noticeId)

      await expect(
        sweepCopyrightEvidenceRetention({ now: daysFromNow(400), noticeIds: [noticeId] }),
      ).resolves.toEqual(nothing)

      await expect(readCopyrightRetentionColumns(noticeId)).resolves.toEqual(columns)
      await expect(readCopyrightRetentionMarker(noticeId)).resolves.toBeNull()
    },
  )

  it.each(RETENTION_BLOCKERS)(
    'keeps a case with %s until it ends',
    async (_name, createBlocked) => {
      await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 1 })
      const blocked = await createBlocked()
      const watched = await watch(blocked.noticeId, blocked.evidenceKey)
      // Three days on: a guest capability issued for a week is still live, every other blocker
      // does not depend on the sweep's clock, and one day of retention has run out for all of them.
      const now = daysFromNow(3)

      await expect(
        sweepCopyrightEvidenceRetention({ now, noticeIds: [blocked.noticeId] }),
      ).resolves.toEqual(nothing)
      await watched.expectUntouched()

      await blocked.release()

      await expect(
        sweepCopyrightEvidenceRetention({ now, noticeIds: [blocked.noticeId] }),
      ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })
      await watched.expectErased()
    },
  )

  it('waits out the period from the release of a preservation hold on a party', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const watched = await watch(entry.noticeId, entry.evidenceKeys[0]!)
    const noticeIds = [entry.noticeId]
    const holdId = await insertPreservationHoldForTest(entry.posterId, entry.moderator.id)
    // The release lands 20 days after the case's own last event, so only it can hold the case.
    await releasePreservationHoldAt(holdId, entry.moderator.id, daysFromNow(20))

    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(40), noticeIds }),
    ).resolves.toEqual(nothing)
    await watched.expectUntouched()

    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(60), noticeIds }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })
    await watched.expectErased()
  })

  it('erases at most the limit per run and finishes the rest on later runs', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const watched = await Promise.all([createWatchedCase(), createWatchedCase()])
    const noticeIds = watched.map(entry => entry.noticeId)
    const now = daysFromNow(400)

    await expect(sweepCopyrightEvidenceRetention({ now, limit: 1, noticeIds })).resolves.toEqual({
      erased: 1,
      ineligible: 0,
      failed: [],
    })
    await expect(sweepCopyrightEvidenceRetention({ now, limit: 1, noticeIds })).resolves.toEqual({
      erased: 1,
      ineligible: 0,
      failed: [],
    })
    for (const entry of watched) await entry.expectErased()

    await expect(sweepCopyrightEvidenceRetention({ now, noticeIds })).resolves.toEqual(nothing)
  })
})
