import {
  observeTestUserPurgeAttempt,
  testPurgeSqlState,
} from '@voucha/test-helpers/reciprocal-user-purge'
import { readTestPurgeAccountState } from '@voucha/test-helpers/reciprocal-user-purge-scene'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestRetentionWindow,
  createTestUser,
  getTestUserRaw,
  getModeratorActionRowsForTest,
  hasTestRetainedIdentityRoot,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { readPreservationHoldsForTest } from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { readTestRetainedUserLegalClocks } from '@voucha/test-helpers/entities/retained-user-legal-clocks'
import { placeUserPreservationHold, releaseUserPreservationHold } from '@services/users'
import { cleanupSoftDeletedUserBatch } from '../cleanup-batches.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'

describe('legal preservation holds and final user purge', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('pauses an eligible final purge until the hold is released', async () => {
    const window = createTestRetentionWindow()
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    await placeUserPreservationHold(admin, user.id, 'matter-purge-pause')

    await expect(
      cleanupSoftDeletedUser(user.id, window.upperBoundDate, window.lowerBoundDate),
    ).resolves.toEqual({ deleted: 0, hasMore: false })
    expect(await getTestUserRaw(user.id)).not.toBeNull()

    await releaseUserPreservationHold(admin, user.id)
    await cleanupSoftDeletedUserBatch(
      window.upperBoundDate,
      500,
      window.lowerBoundDate,
      undefined,
      [user.id],
    )

    expect(await getTestUserRaw(user.id)).toBeNull()
  })

  it('skips a held account in batch selection while purging an eligible sibling', async () => {
    const window = createTestRetentionWindow()
    const admin = await createTestUser({ administrator: true })
    const [held, sibling] = await Promise.all([createTestUser(), createTestUser()])
    await Promise.all([
      softDeleteUserAt(held.id, window.firstEligibleDate),
      softDeleteUserAt(sibling.id, window.firstEligibleDate),
    ])
    await placeUserPreservationHold(admin, held.id, 'matter-purge-batch')

    await cleanupSoftDeletedUserBatch(
      window.upperBoundDate,
      500,
      window.lowerBoundDate,
      undefined,
      [held.id, sibling.id],
    )

    expect(await getTestUserRaw(sibling.id)).toBeNull()
    expect(await getTestUserRaw(held.id)).not.toBeNull()
  })

  it('keeps a released hold and the identities it names after the account is hard-deleted', async () => {
    const window = createTestRetentionWindow()
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    await placeUserPreservationHold(admin, user.id, 'matter-purge-1')
    await releaseUserPreservationHold(admin, user.id)

    await softDeleteUserAt(user.id, window.firstEligibleDate)
    await cleanupSoftDeletedUserBatch(
      window.upperBoundDate,
      500,
      window.lowerBoundDate,
      undefined,
      [user.id],
    )
    await cleanupRetainedIdentityRoots(1_000, { user: [user.id] })

    expect(await getTestUserRaw(user.id)).toBeNull()
    expect(await hasTestRetainedIdentityRoot('user', user.id)).toBe(true)
    const retained = await readTestRetainedUserLegalClocks(user.id)
    expect(retained?.purged_at).toBeInstanceOf(Date)
    expect(await readPreservationHoldsForTest(user.id)).toEqual([
      expect.objectContaining({
        account_user_id: user.id,
        reference: 'matter-purge-1',
        placed_by_id: admin.id,
        released_by_id: admin.id,
        released_at: expect.any(Date),
      }),
    ])
  })

  it('keeps racing hold and purge attempts atomic before one strict next tick', async () => {
    const window = createTestRetentionWindow()
    const [admin, user] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    const before = await readTestPurgeAccountState(user.id)
    const auditBefore = await getModeratorActionRowsForTest({ targetUserId: user.id })
    let purge: PromiseSettledResult<Awaited<ReturnType<typeof cleanupSoftDeletedUser>>> | undefined
    const restore = afterPostgresTransactionQueryForTest(
      'lockPreservationHoldUser:userExists',
      values => values.includes(user.id),
      async () => {
        ;[purge] = await Promise.allSettled([
          cleanupSoftDeletedUser(user.id, window.upperBoundDate),
        ])
      },
    )
    const reference = 'synthetic concurrent preservation'
    let admission: PromiseSettledResult<Awaited<ReturnType<typeof placeUserPreservationHold>>>
    try {
      ;[admission] = await Promise.allSettled([
        placeUserPreservationHold(admin, user.id, reference),
      ])
    } finally {
      restore()
    }
    expect(purge).toBeDefined()
    const errors = [purge!, admission!].flatMap(outcome =>
      outcome.status === 'rejected' ? [testPurgeSqlState(outcome.reason)] : [],
    )
    expect(errors.filter(code => code !== '40001' && code !== '40P01')).toEqual([])
    const held = admission!.status === 'fulfilled'
    const deleted = purge!.status === 'fulfilled'
    expect(held && deleted).toBe(false)
    expect(purge!.status === 'fulfilled' ? purge!.value : undefined).toEqual(
      deleted ? { deleted: 1, hasMore: false } : undefined,
    )
    const timestamp = expect.any(Date)
    const hold = expect.objectContaining({
      account_user_id: user.id,
      placed_by_id: admin.id,
      reference,
      released_at: null,
      released_by_id: null,
      placed_at: timestamp,
    })
    const afterRace = await readTestPurgeAccountState(user.id)
    expect(afterRace).toEqual({
      ...before,
      user: deleted ? null : before.user,
      references: deleted ? null : before.references,
      clock: { ...before.clock, purged_at: deleted ? timestamp : null },
      holds: held ? [hold] : before.holds,
      notifications: deleted ? { notifications: 0, push_intents: 0 } : before.notifications,
    })
    expect(await getModeratorActionRowsForTest({ targetUserId: user.id })).toHaveLength(
      auditBefore.length + Number(held),
    )
    // Both real actors settled. This single next-tick call may not abort or silently do nothing.
    const remaining = !held && afterRace.user !== null ? 1 : 0
    const next = await observeTestUserPurgeAttempt(() =>
      cleanupSoftDeletedUserBatch(window.upperBoundDate, 500, window.lowerBoundDate, undefined, [
        user.id,
      ]),
    )
    expect(next.failures).toEqual([])
    expect(next.result).toEqual({ deleted: remaining, hasMore: false })
    const final = await readTestPurgeAccountState(user.id)
    expect(final).toEqual({
      ...before,
      user: held ? before.user : null,
      references: held ? before.references : null,
      clock: { ...before.clock, purged_at: held ? null : timestamp },
      holds: held ? [hold] : before.holds,
      notifications: held ? before.notifications : { notifications: 0, push_intents: 0 },
    })
    expect(final.user === null || final.holds.some(value => value.released_at === null)).toBe(true)
  })
})
