import { describe, expect, it } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipGrantRemainingMilliseconds,
  getTestMembershipSourceState,
  setTestMembershipGrantRemainingMilliseconds,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../create.mts'
import { getMembershipByUserId } from '../get.mts'
import { resumeGrantAfterDirectTermination } from './resume-after-direct-termination.mts'
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
    const queued = await grantMembership(admin.id, directUser.id, 'pro', grantSku.id, 30)

    await expect(getMembershipByUserId(directUser.id)).resolves.toMatchObject({
      id: direct.id,
      plan: 'plus',
    })
    await expect(getTestGrantQueue(directUser.id)).resolves.toMatchObject({
      grant_ids: expect.arrayContaining([queued.grantId]),
      open_activation_count: 0,
    })
  })

  it('pauses an active grant before projecting a new direct term', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
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
    const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
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
    const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
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
    await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
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
    const elapsed = await grantMembership(admin.id, member.id, 'plus', elapsedSku.id, 30)
    const successorSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    await grantMembership(admin.id, member.id, 'plus', successorSku.id, 30)
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
    await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
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

    await expect(resumeGrantAfterDirectTermination(member.id, terminal.id)).resolves.toBe(true)
    await expect(resumeGrantAfterDirectTermination(member.id, terminal.id)).resolves.toBe(false)
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({ plan: 'plus' })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      active_grant_ids: [pausedGrantId],
      open_activation_count: 1,
    })
  })

  it('skips an exhausted paused grant and resumes its queued FIFO successor', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const pausedSku = await createTestSku({ plan: 'plus' })
    const pausedMembership = await grantMembership(admin.id, member.id, 'plus', pausedSku.id, 1)
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
    await grantMembership(admin.id, member.id, 'plus', successorSku.id, 30)
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

    await expect(resumeGrantAfterDirectTermination(member.id, terminal.id)).resolves.toBe(true)
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
    const pausedMembership = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 1)
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

    await expect(resumeGrantAfterDirectTermination(member.id, terminal.id)).resolves.toBe(true)
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
