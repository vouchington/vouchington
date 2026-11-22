import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestRetentionWindow,
  createTestUser,
  getTestUserRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { readPreservationHoldsForTest } from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { placeUserPreservationHold } from '@services/users'
import { cleanupSoftDeletedUserBatch } from '../cleanup-batches.mts'

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
})
