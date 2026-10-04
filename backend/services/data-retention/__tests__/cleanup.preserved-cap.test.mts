import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  createTestSku,
  createTestRetentionWindow,
  softDeleteUserAt,
  getTestUserRaw,
  getTestMembershipGrant,
} from '@voucha/test-helpers'
import { grantMembership } from '../../memberships/index.mts'
import { cleanupSoftDeletedUsers } from '../cleanup.mts'

describe('retained grant purge budget', () => {
  it('terminalizes capped grant pages before deleting the live user parent', async () => {
    const admin = await createTestUserDirect()
    const user = await createTestUserDirect()
    const sku = await createTestSku({ plan: 'plus' })
    const first = await grantMembership(admin.id, user.id, 'plus', sku.id, 30)
    const second = await grantMembership(admin.id, user.id, 'plus', sku.id, 30)
    const third = await grantMembership(admin.id, user.id, 'plus', sku.id, 30)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    const options = { ...window, batchSize: 1, maxBatches: 1 }
    await expect(cleanupSoftDeletedUsers(options)).resolves.toEqual({ deleted: 0, hasMore: true })
    expect(await getTestUserRaw(user.id)).not.toBeNull()
    const grants = await Promise.all(
      [first, second, third].map(grant => getTestMembershipGrant(grant.grantId)),
    )
    expect(grants.filter(grant => grant?.revoked_at)).toHaveLength(1)
    await cleanupSoftDeletedUsers(options)
    await cleanupSoftDeletedUsers(options)
    await cleanupSoftDeletedUsers(options)
    await expect(cleanupSoftDeletedUsers(options)).resolves.toEqual({ deleted: 1, hasMore: true })
    expect(await getTestUserRaw(user.id)).toBeNull()
    const settled = await Promise.all(
      [first, second, third].map(grant => getTestMembershipGrant(grant.grantId)),
    )
    expect(settled.every(grant => grant?.revoked_at && grant.source_cancelled_at)).toBe(true)
  })
})
