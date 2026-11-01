import { describe, expect, it } from 'vitest'
import { createTestUser, createTestUserDirect } from '@voucha/test-helpers'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  addCopyrightCasePurgeFixtureParty,
  readCopyrightCasePurgeFixtureAccountClock,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import { placeUserPreservationHold } from '../users/preservation-holds.mts'
import { runCopyrightAccountClockSyncPage } from './retention-account-clock-sync.mts'

describe('copyright case account clock fan-out', () => {
  const setPageSize = useCopyrightCasePurgePageSize()

  it('signals only a party account, then advances its case clock and clears the signal', async () => {
    await setPageSize(2)
    const [admin, unrelated, entry] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUserDirect(),
      createRetentionMinimalCase(),
    ])
    await addCopyrightCasePurgeFixtureParty(entry.noticeId, entry.posterId)
    const before = await readCopyrightCasePurgeFixtureAccountClock(entry.posterId)
    expect(before).toMatchObject({ pending: false })

    await placeUserPreservationHold(admin, unrelated.id, 'unrelated-case-clock-fixture')
    expect(await readCopyrightCasePurgeFixtureAccountClock(unrelated.id)).toMatchObject({
      pending: false,
      noticeClock: null,
    })

    const hold = await placeUserPreservationHold(admin, entry.posterId, 'party-case-clock-fixture')
    expect(await readCopyrightCasePurgeFixtureAccountClock(entry.posterId)).toMatchObject({
      pending: true,
    })
    const sync = await runCopyrightAccountClockSyncPage({
      accountUserId: entry.posterId,
      afterNoticeId: null,
      sourceVersion: null,
    })
    expect(sync.hasMore).toBe(false)
    const after = await readCopyrightCasePurgeFixtureAccountClock(entry.posterId)
    expect(after.pending).toBe(false)
    expect(after.noticeClock?.getTime()).toBeGreaterThanOrEqual(hold.placed_at.getTime())
  })
})
