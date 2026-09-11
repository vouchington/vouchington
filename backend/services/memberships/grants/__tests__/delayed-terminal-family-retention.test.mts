import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  setTestMembershipGrantRemainingMilliseconds,
  waitForQueueJobs,
} from '@voucha/test-helpers'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import { createMembership, grantMembership } from '../../create.mts'
import { getMembershipByUserId } from '../../get.mts'
import { updateMembershipFromWebhook } from '../../update.mts'

describe('delayed direct termination with an elapsed queued grant', () => {
  it('retains family access and does not enqueue child removal', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `delayed-terminal-family-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: member.id,
    })
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_delayed_terminal_family_${randomUUID()}`,
    })
    const grantSku = await createTestSku({ plan: 'plus' })
    await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    const [queuedGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(queuedGrantId).toBeDefined()
    await setTestMembershipGrantRemainingMilliseconds(queuedGrantId!, 0.5)
    const terminalEffectiveAt = new Date()

    const terminal = await updateMembershipFromWebhook(
      {
        membershipId: direct.id,
        status: 'cancelled',
        terminalEffectiveAt,
      },
      async () => false,
    )

    expect(terminal?.current.status).toBe('cancelled')
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
    const queuedChildRemoval = (
      await waitForQueueJobs(
        unfurlReferralLinksQueue,
        jobs => jobs.some(job => (job.data as { userId?: string } | null)?.userId === member.id),
        200,
      )
    ).filter(job => (job.data as { userId?: string } | null)?.userId === member.id)
    expect(queuedChildRemoval).toHaveLength(0)
  })
})
