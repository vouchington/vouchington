import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  holdTestMembershipRowLock,
  probeTestUserLock,
} from '@voucha/test-helpers'
import { grantMembership } from './create.mts'
import * as lockUser from './lock-user.mts'

describe('createMembership lock order', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('locks the user before waiting on the current projection', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const membership = await createTestMembership({ user_id: member.id })
    const sku = await createTestSku({ plan: 'pro' })
    const projectionLocked = Promise.withResolvers<void>()
    const releaseProjection = Promise.withResolvers<void>()
    const holder = holdTestMembershipRowLock(membership.id, projectionLocked, releaseProjection)
    await projectionLocked.promise

    const userLocked = Promise.withResolvers<void>()
    const lockMembershipUser = lockUser.lockMembershipUser
    vi.spyOn(lockUser, 'lockMembershipUser').mockImplementation(async (...args) => {
      await lockMembershipUser(...args)
      userLocked.resolve()
    })

    const creation = grantMembership(admin.id, member.id, 'pro', sku.id, 30)
    try {
      await userLocked.promise
      await expect(probeTestUserLock(member.id)).rejects.toMatchObject({ code: '55P03' })
    } finally {
      releaseProjection.resolve()
    }
    await holder
    await expect(creation).resolves.toMatchObject({ queued: true })
  })
})
