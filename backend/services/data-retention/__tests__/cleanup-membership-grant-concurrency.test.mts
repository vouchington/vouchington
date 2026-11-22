import { describe, expect, it } from 'vitest'
import {
  createTestRetentionWindow,
  createTestSku,
  createTestUserDirect,
  getTestMembershipGrant,
  getTestUserRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { grantMembership } from '../../memberships/create.mts'
import { revokeMembershipGrant } from '../../memberships/grants/revoke.mts'
import { runDataRetentionCleanup } from '../cleanup.mts'
import {
  areTestUsersDeleted,
  runUserPurgeTicksForTest,
} from '../../../test-helpers/user-purge-ticks.mts'

describe('membership grant cleanup concurrency', () => {
  it('preserves revocation committed before the overlapping cleanup reads eligibility', async () => {
    const window = createTestRetentionWindow()
    const [administrator, member, excludedMember] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    if (!administrator || !member || !excludedMember) throw new Error('Failed to create test users')
    const sku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(administrator.id, member.id, 'plus', sku.id, 30)
    await Promise.all([
      softDeleteUserAt(member.id, window.firstEligibleDate),
      softDeleteUserAt(excludedMember.id, window.firstEligibleDate),
    ])
    const excludedBeforeCleanup = await getTestUserRaw(excludedMember.id)

    let revocation: ReturnType<typeof revokeMembershipGrant>
    const revocationReady = Promise.withResolvers<void>()
    const releaseRevocation = Promise.withResolvers<void>()
    let restoreCleanup: (() => void) | undefined
    const restoreRevocation = beforePostgresTransactionQueryForTest(
      'recordMembershipEntitlementEffects',
      values => values.some(value => Array.isArray(value) && value.includes(member.id)),
      async () => {
        restoreRevocation()
        restoreCleanup = beforePostgresTransactionQueryForTest(
          'cleanupSoftDeletedUserBatch: check target',
          values => values.includes(member.id),
          async () => {
            releaseRevocation.resolve()
            await revocation
          },
        )
        revocationReady.resolve()
        await releaseRevocation.promise
      },
    )
    revocation = revokeMembershipGrant(administrator.id, grant.grantId, 'concurrent cleanup')
    const revocationOutcome = Promise.allSettled([revocation])
    let cleanupOutcome:
      | Promise<PromiseSettledResult<{ deleted: number; hasMore: boolean }[]>[]>
      | undefined
    try {
      await Promise.race([
        revocationReady.promise,
        revocationOutcome.then(() => {
          throw new Error('Grant revocation completed before reaching the concurrency barrier')
        }),
      ])
      // Another file's purge can abort the first tick with an unrelated 40001; the next tick
      // then runs after the revocation has committed, which is the state under test.
      const cleanup = runUserPurgeTicksForTest(
        () =>
          runDataRetentionCleanup(
            { batchSize: 500, maxBatches: 1 },
            {
              families: ['softDeletedUsers'],
              softDeletedUsers: { ...window, userIds: [member.id] },
            },
          ).then(result => result.softDeletedUsers),
        () => areTestUsersDeleted([member.id]),
      )
      cleanupOutcome = Promise.allSettled([cleanup])
      const ticks = await cleanup
      expect(ticks.reduce((count, result) => count + result.deleted, 0)).toBe(1)
      expect(ticks.at(-1)?.hasMore).toBe(false)
      await expect(revocation).resolves.toMatchObject({ alreadyRevoked: false })
    } finally {
      releaseRevocation.resolve()
      restoreCleanup?.()
      restoreRevocation()
      await Promise.all([revocationOutcome, cleanupOutcome])
    }

    expect(await getTestUserRaw(member.id)).toBeNull()
    expect(excludedBeforeCleanup).not.toBeNull()
    expect(await getTestUserRaw(excludedMember.id)).toEqual(excludedBeforeCleanup)
    await expect(getTestMembershipGrant(grant.grantId)).resolves.toMatchObject({
      revoked_by_id: administrator.id,
      revocation_reason: 'concurrent cleanup',
      revoked_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
      activation_ended_at: expect.any(Date),
    })
  })
})
