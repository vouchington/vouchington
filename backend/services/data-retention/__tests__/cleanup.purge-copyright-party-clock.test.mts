import { beginTransaction } from '@data-stores/psql'
import { createTestRetentionWindow, createTestUser, softDeleteUserAt } from '@voucha/test-helpers'
import { readTestRetainedUserLegalClocks } from '@voucha/test-helpers/entities/retained-user-legal-clocks'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { readCopyrightCasePurgeFixtureAccountClock } from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import { describe, expect, it } from 'vitest'
import { retainCopyrightCaseAccountParty } from '../../copyright-notices/retention-parties-admission.mts'
import { runCopyrightAccountClockSyncPage } from '../../copyright-notices/retention-account-clock-sync.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

describe('final purge and a concurrently admitted copyright party', () => {
  it('syncs the case clock of a party admitted while the purge ran', async () => {
    const window = createTestRetentionWindow()
    const [user, entry] = await Promise.all([createTestUser(), createRetentionMinimalCase()])
    await softDeleteUserAt(user.id, window.firstEligibleDate)

    // The admission has inserted its party but not committed when the purge's DELETE takes its snapshot.
    await using admission = await beginTransaction()
    await retainCopyrightCaseAccountParty(admission, entry.noticeId, user.id)
    await expect(cleanupSoftDeletedUser(user.id, window.upperBoundDate)).resolves.toEqual({
      deleted: 1,
      hasMore: false,
    })
    await admission.commit()

    const purgedAt = (await readTestRetainedUserLegalClocks(user.id))?.purged_at
    expect(purgedAt).toBeInstanceOf(Date)
    expect(await readCopyrightCasePurgeFixtureAccountClock(user.id)).toMatchObject({
      pending: true,
    })

    const sync = await runCopyrightAccountClockSyncPage({
      accountUserId: user.id,
      afterNoticeId: null,
      sourceVersion: null,
    })
    expect(sync.hasMore).toBe(false)
    const after = await readCopyrightCasePurgeFixtureAccountClock(user.id)
    expect(after.pending).toBe(false)
    expect(after.noticeClock!.getTime()).toBeGreaterThanOrEqual(purgedAt!.getTime())
  })
})
