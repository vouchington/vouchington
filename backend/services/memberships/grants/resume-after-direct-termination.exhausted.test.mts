import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestAdminGrantMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipSourceState,
  insertQueuedMembershipGrant,
  setTestMembershipGrantRemainingMilliseconds,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import { getMembershipByUserId } from '../get.mts'
import { resumeGrantAfterDirectAccessSuspensionInTransaction as resumeDirect } from './resume-after-direct-termination.mts'

// Committed fixtures: the SERIALIZABLE grant writer is only setup here, and parallel tests'
// predicate locks can abort it with 40001. Writer coverage lives in create.test.mts.
describe('exhausted paused grants resumed after direct termination', () => {
  it('skips an exhausted paused grant and resumes its queued FIFO successor', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const pausedSku = await createTestSku({ plan: 'plus' })
    const pausedMembership = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: pausedSku.id,
      userId: member.id,
    })
    const [pausedGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(pausedGrantId).toBeDefined()
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_exhausted_pause_${member.id}`,
    })
    await setTestMembershipGrantRemainingMilliseconds(pausedGrantId!, 0.5)
    const successorSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: successorSku.id,
      userId: member.id,
      durationDays: 30,
    })
    const [, successorGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(successorGrantId).toBeDefined()
    const terminal = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_exhausted_pause_${member.id}`,
      status: 'cancelled',
      effectiveAt: new Date('2026-09-04T11:00:00.000Z'),
      terminalEffectiveAt: new Date('2026-09-04T12:00:00.000Z'),
    })

    await expect(resumeDirectAccessSuspension(member.id, terminal.id)).resolves.toMatchObject({
      changed: true,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({ plan: 'plus' })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      active_grant_ids: [successorGrantId],
      open_activation_count: 1,
    })
    const directSourceState = await getTestMembershipSourceState(terminal.id)
    expect(directSourceState?.cancelled_at).toBeInstanceOf(Date)
    await expect(getTestMembershipSourceState(pausedMembership.id)).resolves.toMatchObject({
      expired_at: directSourceState?.cancelled_at,
      paused_at: null,
    })
  })

  it('reports a change when terminalizing an exhausted paused grant without a successor', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const pausedMembership = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
    })
    const [pausedGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(pausedGrantId).toBeDefined()
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_exhausted_only_${member.id}`,
    })
    await setTestMembershipGrantRemainingMilliseconds(pausedGrantId!, 0.5)
    const terminal = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_exhausted_only_${member.id}`,
      status: 'cancelled',
      effectiveAt: new Date('2026-09-04T11:00:00.000Z'),
      terminalEffectiveAt: new Date('2026-09-04T12:00:00.000Z'),
    })

    await expect(resumeDirectAccessSuspension(member.id, terminal.id)).resolves.toMatchObject({
      changed: true,
    })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      active_grant_ids: [],
      open_activation_count: 0,
    })
    const directSourceState = await getTestMembershipSourceState(terminal.id)
    expect(directSourceState?.cancelled_at).toBeInstanceOf(Date)
    await expect(getTestMembershipSourceState(pausedMembership.id)).resolves.toMatchObject({
      expired_at: directSourceState?.cancelled_at,
      paused_at: null,
    })
  })
})

async function resumeDirectAccessSuspension(userId: string, membershipId: string) {
  await using transaction = await beginTransaction()
  const outcome = await resumeDirect(userId, membershipId, transaction)
  await transaction.commit()
  return outcome
}
