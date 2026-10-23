import { describe, expect, it } from 'vitest'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  copyrightIncidentExists,
  copyrightNoticeExists,
  isMinimalPurgeEligible,
  isRetainedIncidentAccount,
  markMinimalAccountClockCaseErased,
  retainedAccountExists,
  seedNonoperativeIncidentAccount,
  startPendingAccountPurge,
} from '@voucha/test-helpers/entities/copyright-minimal-account-clock'
import { eraseCopyrightRetentionCase } from './retention-erasure-case.mts'
import { purgeCopyrightMinimalRecord } from './retention-minimal-purge-case.mts'

describe('copyright minimal account clock', () => {
  it('starts three years after the later account purge even when the incident stopped years earlier', async () => {
    const fixture = await createRetentionMinimalCase()
    const retainedAccountId = await seedNonoperativeIncidentAccount(
      fixture.noticeId,
      new Date('2029-10-22T00:00:00Z'),
    )
    expect(await isRetainedIncidentAccount(fixture.noticeId, retainedAccountId)).toBe(true)
    const evidenceNow = new Date('2030-10-23T00:00:00Z')
    await expect(
      eraseCopyrightRetentionCase(fixture.noticeId, {
        now: evidenceNow,
        cutoff: new Date('2027-10-23T00:00:00Z'),
        retentionDays: 1095,
      }),
    ).resolves.toBe('erased')

    // Build the bounded party and mutation proof while the clock is still too
    // young; the case and its incident remain intact for the boundary checks.
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2032-10-21T23:59:59Z'),
        cutoff: new Date('2029-10-21T23:59:59Z'),
        maxBatches: 16,
      }),
    ).resolves.toBe('ineligible')

    expect(
      await isMinimalPurgeEligible(
        fixture.noticeId,
        new Date('2032-10-21T23:59:59Z'),
        new Date('2029-10-21T23:59:59Z'),
      ),
    ).toBe(false)
    expect(
      await isMinimalPurgeEligible(
        fixture.noticeId,
        new Date('2032-10-22T00:00:00Z'),
        new Date('2029-10-22T00:00:00Z'),
      ),
    ).toBe(true)
    const options = {
      now: new Date('2032-10-22T00:00:00Z'),
      cutoff: new Date('2029-10-22T00:00:00Z'),
      maxBatches: 1,
    }
    let incidentDrained = false
    for (let page = 0; page < 16; page++) {
      await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
      if (!(await copyrightIncidentExists(fixture.noticeId))) {
        incidentDrained = true
        break
      }
    }
    expect(incidentDrained).toBe(true)
    expect(await isRetainedIncidentAccount(fixture.noticeId, retainedAccountId)).toBe(true)
    expect(
      await isMinimalPurgeEligible(
        fixture.noticeId,
        new Date('2032-10-21T23:59:59Z'),
        new Date('2029-10-21T23:59:59Z'),
      ),
    ).toBe(false)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, { ...options, maxBatches: 16 }),
    ).resolves.toBe('purged')
    expect(await copyrightNoticeExists(fixture.noticeId)).toBe(false)
    expect(await retainedAccountExists(retainedAccountId)).toBe(true)
  })

  it('uses the committed account-purge clock before deleting a case', async () => {
    const fixture = await createRetentionMinimalCase()
    const accountId = await seedNonoperativeIncidentAccount(fixture.noticeId, null)
    await markMinimalAccountClockCaseErased(fixture.noticeId)

    await using accountPurge = await startPendingAccountPurge(accountId)

    const pendingCasePurge = purgeCopyrightMinimalRecord(fixture.noticeId, {
      now: new Date('2030-10-23T00:00:00Z'),
      cutoff: new Date('2027-10-23T00:00:00Z'),
    })
    await accountPurge.commit()
    await expect(pendingCasePurge).resolves.toBe('ineligible')
    expect(
      await isMinimalPurgeEligible(
        fixture.noticeId,
        new Date('2030-10-23T00:00:00Z'),
        new Date('2027-10-23T00:00:00Z'),
      ),
    ).toBe(false)
  })
})
