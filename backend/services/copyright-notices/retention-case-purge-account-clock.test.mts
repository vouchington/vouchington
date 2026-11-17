import { createTestPreservationHold } from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { describe, expect, it } from 'vitest'
import { createTestUser, createTestUserDirect } from '@voucha/test-helpers'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  addCopyrightCasePurgeFixtureParty,
  readCopyrightCasePurgeFixtureAccountClock,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import {
  afterCopyrightAccountClockSource,
  releaseAfterCopyrightAccountClockAcknowledgement,
} from '@voucha/test-helpers/copyright-account-clock-race'
import {
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '../users/preservation-holds.mts'
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

    await createTestPreservationHold(unrelated.id, admin.id, 'unrelated-case-clock-fixture')
    expect(await readCopyrightCasePurgeFixtureAccountClock(unrelated.id)).toMatchObject({
      pending: false,
      noticeClock: null,
    })

    const hold = await createTestPreservationHold(
      entry.posterId,
      admin.id,
      'party-case-clock-fixture',
    )
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

  it('retains the pending signal when a newer hold commits after the source read', async () => {
    await setPageSize(2)
    const [admin, entry] = await Promise.all([
      createTestUser({ administrator: true }),
      createRetentionMinimalCase(),
    ])
    await addCopyrightCasePurgeFixtureParty(entry.noticeId, entry.posterId)
    await createTestPreservationHold(entry.posterId, admin.id, 'first-clock-source')
    const before = await readCopyrightCasePurgeFixtureAccountClock(entry.posterId)
    let replacement: Awaited<ReturnType<typeof placeUserPreservationHold>> | undefined
    const first = await afterCopyrightAccountClockSource(
      entry.posterId,
      () =>
        runCopyrightAccountClockSyncPage({
          accountUserId: entry.posterId,
          afterNoticeId: null,
          sourceVersion: null,
        }),
      async () => {
        await releaseUserPreservationHold(admin, entry.posterId)
        replacement = await placeUserPreservationHold(admin, entry.posterId, 'new-clock-source')
      },
    )
    expect(first.hasMore).toBe(true)
    expect(await readCopyrightCasePurgeFixtureAccountClock(entry.posterId)).toEqual(before)
    expect(replacement).toBeDefined()
    const completed = await runCopyrightAccountClockSyncPage(first.data)
    expect(completed.hasMore).toBe(false)
    const after = await readCopyrightCasePurgeFixtureAccountClock(entry.posterId)
    expect(after.pending).toBe(false)
    expect(after.noticeClock!.getTime()).toBeGreaterThanOrEqual(replacement!.placed_at.getTime())
  })

  it('finishes a duplicate page without acknowledging a source it no longer owns', async () => {
    await setPageSize(2)
    const [admin, entry] = await Promise.all([
      createTestUser({ administrator: true }),
      createRetentionMinimalCase(),
    ])
    await addCopyrightCasePurgeFixtureParty(entry.noticeId, entry.posterId)
    const hold = await createTestPreservationHold(
      entry.posterId,
      admin.id,
      'duplicate-clock-source',
    )
    const data = { accountUserId: entry.posterId, afterNoticeId: null, sourceVersion: null }
    let sibling: Awaited<ReturnType<typeof runCopyrightAccountClockSyncPage>> | undefined
    const result = await afterCopyrightAccountClockSource(
      entry.posterId,
      () => runCopyrightAccountClockSyncPage(data),
      async () => {
        sibling = await runCopyrightAccountClockSyncPage(data)
      },
    )
    expect(result.hasMore).toBe(false)
    expect(sibling?.hasMore).toBe(false)
    const after = await readCopyrightCasePurgeFixtureAccountClock(entry.posterId)
    expect(after.pending).toBe(false)
    expect(after.noticeClock!.getTime()).toBeGreaterThanOrEqual(hold.placed_at.getTime())
  })

  it('retains a release signal committed after the sync acknowledgement', async () => {
    await setPageSize(2)
    const [admin, entry] = await Promise.all([
      createTestUser({ administrator: true }),
      createRetentionMinimalCase(),
    ])
    await addCopyrightCasePurgeFixtureParty(entry.noticeId, entry.posterId)
    await createTestPreservationHold(entry.posterId, admin.id, 'later-release-clock')
    const first = await releaseAfterCopyrightAccountClockAcknowledgement(
      entry.posterId,
      () =>
        runCopyrightAccountClockSyncPage({
          accountUserId: entry.posterId,
          afterNoticeId: null,
          sourceVersion: null,
        }),
      () => releaseUserPreservationHold(admin, entry.posterId),
    )
    expect(first.hasMore).toBe(false)
    expect((await readCopyrightCasePurgeFixtureAccountClock(entry.posterId)).pending).toBe(true)
    const next = await runCopyrightAccountClockSyncPage(first.data)
    expect(next.hasMore).toBe(false)
    expect((await readCopyrightCasePurgeFixtureAccountClock(entry.posterId)).pending).toBe(false)
  })
})
