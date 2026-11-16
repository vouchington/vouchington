import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestAdminGrantMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipGrantRemainingMilliseconds,
  insertQueuedMembershipGrant,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import { getMembershipByUserId } from '../get.mts'
import { resumeGrantAfterDirectAccessSuspensionInTransaction as resumeDirect } from './resume-after-direct-termination.mts'
import { updateMembershipFromEvent } from '../update.mts'

describe('direct terms', () => {
  it('queues an admin grant behind a live direct term', async () => {
    const admin = await createTestUser({ administrator: true })
    const directUser = await createTestUser()
    const directSku = await createTestSku({ plan: 'plus' })
    const direct = await createMembership({
      userId: directUser.id,
      plan: 'plus',
      skuId: directSku.id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: `sub_grant_precedence_${directUser.id}`,
    })
    const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const queuedGrantId = await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: directUser.id,
      durationDays: 30,
    })

    await expect(getMembershipByUserId(directUser.id)).resolves.toMatchObject({
      id: direct.id,
      plan: 'plus',
    })
    await expect(getTestGrantQueue(directUser.id)).resolves.toMatchObject({
      grant_ids: expect.arrayContaining([queuedGrantId]),
      open_activation_count: 0,
    })
  })

  it('pauses an active grant before projecting a new direct term', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    await activeGrant(admin, member, grantSku)
    const [grantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(grantId).toBeDefined()
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })

    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: `sub_pause_grant_${member.id}`,
    })

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({ plan: 'pro' })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({ open_activation_count: 0 })
    await expect(getTestMembershipGrantRemainingMilliseconds(grantId!)).resolves.toBeGreaterThan(0)
  })

  it('keeps an active grant effective when a direct source arrives terminal', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await activeGrant(admin, member, grantSku)
    const terminalSku = await createTestSku({ plan: 'pro', interval: 'yearly' })

    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: terminalSku.id,
      stripeSubscriptionId: `sub_terminal_direct_${member.id}`,
      status: 'cancelled',
      effectiveAt: new Date('2020-01-01T00:00:00.000Z'),
      terminalEffectiveAt: new Date('2020-01-02T00:00:00.000Z'),
    })

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      id: grant.id,
      plan: 'plus',
      status: 'active',
    })
  })

  it('keeps an active grant effective when a direct source arrives paused', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await activeGrant(admin, member, grantSku)
    const pausedSku = await createTestSku({ plan: 'pro', interval: 'yearly' })

    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: pausedSku.id,
      stripeSubscriptionId: `sub_initial_paused_direct_${member.id}`,
      status: 'paused',
    })

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      id: grant.id,
      plan: 'plus',
      status: 'active',
    })
  })

  it('resumes a paused grant when a direct source transitions from active to paused', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    await activeGrant(admin, member, grantSku)
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_active_to_paused_direct_${member.id}`,
    })

    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
  })

  it('normalizes an elapsed grant and preserves its promoted queued successor for a terminal direct source', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const elapsedSku = await createTestSku({ plan: 'plus' })
    const elapsed = await activeGrant(admin, member, elapsedSku)
    const successorSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    await queuedGrant(admin, member, successorSku, 30)
    await updateTestMembershipExpiresAt(elapsed.id, new Date('2020-01-01T00:00:00.000Z'))
    const terminalSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: terminalSku.id,
      stripeSubscriptionId: `sub_terminal_elapsed_${member.id}`,
      status: 'cancelled',
      effectiveAt: new Date('2020-01-01T00:00:00.000Z'),
      terminalEffectiveAt: new Date('2020-01-02T00:00:00.000Z'),
    })

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({ plan: 'plus' })
  })

  it('resumes the paused grant at the supplied direct termination time', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    await activeGrant(admin, member, grantSku)
    const [pausedGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_resume_grant_${member.id}`,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    })
    const terminal = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_resume_grant_${member.id}`,
      status: 'cancelled',
      effectiveAt: new Date('2026-09-04T11:00:00.000Z'),
      terminalEffectiveAt: new Date('2026-09-04T12:00:00.000Z'),
    })

    await expect(resumeDirectAccessSuspension(member.id, terminal.id)).resolves.toMatchObject({
      changed: true,
    })
    await expect(resumeDirectAccessSuspension(member.id, terminal.id)).resolves.toMatchObject({
      changed: false,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({ plan: 'plus' })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      active_grant_ids: [pausedGrantId],
      open_activation_count: 1,
    })
  })

  it('accepts a provider-authoritative active term whose period end is in the past', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    await expect(
      createMembership({
        userId: member.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: `sub_late_active_${member.id}`,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ id: expect.any(String) })
  })
})

async function resumeDirectAccessSuspension(userId: string, membershipId: string) {
  await using transaction = await beginTransaction()
  const outcome = await resumeDirect(userId, membershipId, transaction)
  await transaction.commit()
  return outcome
}

function activeGrant(admin: { id: string }, member: { id: string }, sku: { id: string }) {
  return createTestAdminGrantMembership({
    grantedById: admin.id,
    productId: sku.id,
    userId: member.id,
  })
}

function queuedGrant(
  admin: { id: string },
  member: { id: string },
  sku: { id: string },
  durationDays: number,
) {
  return insertQueuedMembershipGrant({
    grantedById: admin.id,
    productId: sku.id,
    userId: member.id,
    durationDays,
  })
}
