import { describe, expect, it } from 'vitest'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  copyrightIncidentExists,
  copyrightNoticeExists,
  isMinimalPurgeEligible,
  isRetainedIncidentAccount,
  retainedAccountExists,
  seedNonoperativeIncidentAccount,
} from '@voucha/test-helpers/entities/copyright-minimal-account-clock'
import { readCopyrightRetentionMarker } from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import {
  advanceCopyrightRetentionWorkPages,
  beginCopyrightAccountPurge,
  setCopyrightMinimalPurgePhaseForRetentionTest,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { purgeCopyrightMinimalRecord } from './retention-minimal-purge.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES } from './retention-minimal-purge-phases.mts'

const WORK_PAGE_CAP = 128

describe('copyright minimal account clock', () => {
  const setClock = useCopyrightRetentionWorkClock()

  it('starts six years after the later account purge even when the incident stopped years earlier', async () => {
    await setClock(new Date('2029-10-22T00:00:00Z'))
    const fixture = await createRetentionMinimalCase()
    const retainedAccountId = await seedNonoperativeIncidentAccount(
      fixture.noticeId,
      new Date('2029-10-22T00:00:00Z'),
    )
    expect(await isRetainedIncidentAccount(fixture.noticeId, retainedAccountId)).toBe(true)
    await setClock(new Date('2035-10-22T00:00:00Z'))
    const erasurePages = await advanceCopyrightRetentionWorkPages(fixture.noticeId)
    expect(erasurePages).toContain('erased')
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.not.toBeNull()

    // Build the bounded party and mutation proof while the clock is still too
    // young; the case and its incident remain intact for the boundary checks.
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2035-10-21T23:59:59Z'),
        cutoff: new Date('2029-10-21T23:59:59Z'),
        maxBatches: 16,
      }),
    ).resolves.toBe('ineligible')

    expect(
      await isMinimalPurgeEligible(
        fixture.noticeId,
        new Date('2035-10-21T23:59:59Z'),
        new Date('2029-10-21T23:59:59Z'),
      ),
    ).toBe(false)
    // The unlocked eligibility read can become stale when an unrelated report commits. Exercise
    // the exact boundary through the production purge entrypoint below, which refreshes its proof.
    const options = {
      now: new Date('2035-10-22T00:00:00Z'),
      cutoff: new Date('2029-10-22T00:00:00Z'),
      maxBatches: 1,
    }
    const incidentPhase = COPYRIGHT_MINIMAL_PURGE_PHASES.findIndex(
      phase => phase.table === 'copyright_repeat_infringer_incidents',
    )
    expect(incidentPhase).toBeGreaterThanOrEqual(0)
    await setCopyrightMinimalPurgePhaseForRetentionTest(fixture.noticeId, incidentPhase)
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    expect(await copyrightIncidentExists(fixture.noticeId)).toBe(false)
    expect(await isRetainedIncidentAccount(fixture.noticeId, retainedAccountId)).toBe(true)
    expect(
      await isMinimalPurgeEligible(
        fixture.noticeId,
        new Date('2035-10-21T23:59:59Z'),
        new Date('2029-10-21T23:59:59Z'),
      ),
    ).toBe(false)
    // The positioned incident page skipped earlier leaves. The parent's late-child fence
    // returns one bounded restart before the next invocation drains those leaves normally.
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, { ...options, maxBatches: WORK_PAGE_CAP }),
    ).resolves.toBe('more')
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, { ...options, maxBatches: WORK_PAGE_CAP }),
    ).resolves.toBe('purged')
    expect(await copyrightNoticeExists(fixture.noticeId)).toBe(false)
    expect(await retainedAccountExists(retainedAccountId)).toBe(true)
  })

  it('uses the committed account-purge clock before deleting a case', async () => {
    await setClock(new Date('2032-10-23T00:00:00Z'))
    const fixture = await createRetentionMinimalCase()
    const accountId = await seedNonoperativeIncidentAccount(fixture.noticeId, null)
    await setClock(new Date('2038-10-23T00:00:00Z'))
    const erasurePages = await advanceCopyrightRetentionWorkPages(fixture.noticeId)
    expect(erasurePages).toContain('erased')
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.not.toBeNull()

    await using accountPurge = await beginCopyrightAccountPurge(
      accountId,
      new Date('2038-10-23T00:00:00Z'),
    )

    const heldClock = new Date('2043-10-23T00:00:00Z')
    await setClock(heldClock)
    const pendingCasePurge = purgeCopyrightMinimalRecord(fixture.noticeId, {
      now: heldClock,
      cutoff: new Date('2037-10-23T00:00:00Z'),
      maxBatches: WORK_PAGE_CAP,
    })
    await accountPurge.commit()
    await expect(pendingCasePurge).resolves.toBe('ineligible')
    expect(
      await isMinimalPurgeEligible(fixture.noticeId, heldClock, new Date('2037-10-23T00:00:00Z')),
    ).toBe(false)
    const eligibleClock = new Date('2044-10-23T00:00:00Z')
    const beforeBoundary = new Date(eligibleClock.getTime() - 1)
    await setClock(beforeBoundary)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: beforeBoundary,
        cutoff: new Date(Date.parse('2038-10-23T00:00:00Z') - 1),
        maxBatches: WORK_PAGE_CAP,
      }),
    ).resolves.toBe('ineligible')
    expect(await copyrightNoticeExists(fixture.noticeId)).toBe(true)
    expect(await retainedAccountExists(accountId)).toBe(true)
    await setClock(eligibleClock)
    // An unrelated report can stale an unlocked positive proof. The production entrypoint
    // refreshes it under the lifetime fences and must purge at the committed account boundary.
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: eligibleClock,
        cutoff: new Date('2038-10-23T00:00:00Z'),
        maxBatches: WORK_PAGE_CAP,
      }),
    ).resolves.toBe('purged')
    expect(await retainedAccountExists(accountId)).toBe(true)
  })
})
