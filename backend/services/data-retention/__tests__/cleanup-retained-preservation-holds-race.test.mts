import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestRetentionWindow,
  createTestUser,
  createTestUserDirect,
  getTestUserRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { readTestPurgeAccountState } from '@voucha/test-helpers/reciprocal-user-purge-scene'
import { createReferralSignupNotification } from '../../notifications/create-referral-signup-notification.mts'
import { readPreservationHoldsForTest } from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { placeUserPreservationHold } from '@services/users'
import { cleanupSoftDeletedUserBatch } from '../cleanup-batches.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

describe('placing a legal preservation hold against the final purge', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['cleanupSoftDeletedUserBatch:lockUser', 'cleanupSoftDeletedUserBatch:delete'])(
    'reports the account gone when the purge holds the account after %s',
    async purgeStatement => {
      const window = createTestRetentionWindow()
      const [admin, user] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
      ])
      await softDeleteUserAt(user.id, window.firstEligibleDate)
      const releasePurge = Promise.withResolvers<void>()
      let placement: Promise<PromiseSettledResult<unknown>> | undefined
      const restore = afterPostgresTransactionQueryForTest(
        purgeStatement,
        values => values.includes(user.id),
        async query => {
          const holderProcessId = await getTestPostgresBackendProcessId(query)
          placement = withTestOwnedPostgresWait(
            {
              holderProcessId,
              pool: 'write',
              lock: { kind: 'transaction' },
              queryMarker: 'lockPreservationHoldUser:userExists',
              releaseHolder: async () => releasePurge.resolve(),
            },
            async waitForLock => {
              const operation = placeUserPreservationHold(admin, user.id, 'matter-purge-first')
              await waitForLock(operation)
              releasePurge.resolve()
              const [settled] = await Promise.allSettled([operation])
              return settled
            },
          )
          void placement.catch(() => releasePurge.resolve())
          await releasePurge.promise
        },
      )
      try {
        await cleanupSoftDeletedUserBatch(
          window.upperBoundDate,
          500,
          window.lowerBoundDate,
          undefined,
          [user.id],
        )
      } finally {
        restore()
      }

      expect(await placement).toMatchObject({ status: 'rejected', reason: { status: 404 } })
      expect(await getTestUserRaw(user.id)).toBeNull()
      expect(await readPreservationHoldsForTest(user.id)).toEqual([])
    },
  )

  it('keeps the preserved rows a stage would delete when a hold commits after the eligibility read', async () => {
    const window = createTestRetentionWindow()
    const [admin, user, witness] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    await createReferralSignupNotification(user.id, witness.id, witness.username)
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    const before = await readTestPurgeAccountState(user.id)
    expect(before.notifications.notifications).toBe(1)

    let placement: Awaited<ReturnType<typeof placeUserPreservationHold>> | undefined
    const restore = afterPostgresTransactionQueryForTest(
      'cleanupSoftDeletedUserBatch: check target',
      values => values.includes(user.id),
      async () => {
        placement = await placeUserPreservationHold(admin, user.id, 'matter-after-eligibility')
      },
    )
    let result: Awaited<ReturnType<typeof cleanupSoftDeletedUser>>
    try {
      result = await cleanupSoftDeletedUser(user.id, window.upperBoundDate)
    } finally {
      restore()
    }

    expect(result).toEqual({ deleted: 0, hasMore: true })
    expect(await getTestUserRaw(user.id)).not.toBeNull()
    expect(await readPreservationHoldsForTest(user.id)).toEqual([
      expect.objectContaining({ id: placement?.id, released_at: null }),
    ])
    expect((await readTestPurgeAccountState(user.id)).notifications).toEqual(before.notifications)
  })
})
