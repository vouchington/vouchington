import { observeTestUserPurgeAttempt } from '@voucha/test-helpers/reciprocal-user-purge'
import { readTestPurgeAccountState } from '@voucha/test-helpers/reciprocal-user-purge-scene'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
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

  it.each([
    { schedule: 'after the hold commits', wait: false },
    { schedule: 'at the blocked account lock', wait: true },
  ])(
    'preserves the held account when purge runs $schedule and on the next tick',
    async ({ wait }) => {
      const window = createTestRetentionWindow()
      const [admin, user] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
      ])
      await softDeleteUserAt(user.id, window.firstEligibleDate)
      const before = await readTestPurgeAccountState(user.id)
      const auditBefore = await getModeratorActionRowsForTest({ targetUserId: user.id })
      const purge = () => cleanupSoftDeletedUser(user.id, window.upperBoundDate)
      const releaseHold = Promise.withResolvers<void>()
      let waitingPurge:
        | Promise<PromiseSettledResult<Awaited<ReturnType<typeof purge>>>[]>
        | undefined
      const restore = afterPostgresTransactionQueryForTest(
        'lockPreservationHoldUser:userExists',
        values => values.includes(user.id),
        async query => {
          if (!wait) return
          const holderProcessId = await getTestPostgresBackendProcessId(query)
          waitingPurge = withTestOwnedPostgresWait(
            {
              holderProcessId,
              pool: 'write',
              lock: { kind: 'transaction' },
              queryMarker: 'cleanupSoftDeletedUserBatch:lockUser',
              releaseHolder: async () => releaseHold.resolve(),
            },
            async waitForLock => {
              const operation = purge()
              await waitForLock(operation)
              releaseHold.resolve()
              return Promise.allSettled([operation])
            },
          )
          void waitingPurge.catch(() => releaseHold.resolve())
          await releaseHold.promise
        },
      )
      const reference = 'synthetic concurrent preservation'
      let admission: Awaited<ReturnType<typeof placeUserPreservationHold>>
      let attempt: PromiseSettledResult<Awaited<ReturnType<typeof purge>>> | undefined
      try {
        admission = await placeUserPreservationHold(admin, user.id, reference)
        ;[attempt] = await (waitingPurge ?? Promise.allSettled([purge()]))
      } finally {
        restore()
      }
      // A purge that sees the committed hold deletes nothing, either at its eligibility read or at its DELETE.
      expect(attempt).toEqual({
        status: 'fulfilled',
        value: wait ? { deleted: 0, hasMore: true } : { deleted: 0, hasMore: false },
      })
      const hold = expect.objectContaining({
        id: admission.id,
        account_user_id: user.id,
        placed_by_id: admin.id,
        reference,
        released_at: null,
        released_by_id: null,
        placed_at: expect.any(Date),
      })
      const expected = { ...before, holds: [hold] }
      expect(await readTestPurgeAccountState(user.id)).toEqual(expected)
      expect(await getModeratorActionRowsForTest({ targetUserId: user.id })).toHaveLength(
        auditBefore.length + 1,
      )

      // The next scheduler tick must finish without a transaction failure.
      const next = await observeTestUserPurgeAttempt(() =>
        cleanupSoftDeletedUserBatch(window.upperBoundDate, 500, window.lowerBoundDate, undefined, [
          user.id,
        ]),
      )
      expect(next.failures).toEqual([])
      expect(next.result).toEqual({ deleted: 0, hasMore: false })
      expect(await readTestPurgeAccountState(user.id)).toEqual(expected)
    },
  )
})
