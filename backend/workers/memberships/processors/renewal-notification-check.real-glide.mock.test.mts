import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  createTestSku,
  attachTestStripeProductionProviderObservation,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { membershipWorkConfig } from '@services/memberships/work-limits'
import { createMembership } from '@services/memberships'
import {
  MEMBERSHIPS_RENEWAL_CHECK_JOB,
  MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB,
} from '@queues/background/enqueues/memberships-jobs-2'
import { memberships } from '@queues/memberships/queues'
import { processRenewalNotificationCheckDispatcher } from './renewal-notification-check.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('renewal dispatcher work budget', () => {
  afterAll(() => memberships.close())
  it('persists its capped cursor and resumes to the next owned renewal', async () => {
    const application = `renewal-cap-${randomUUID()}`
    const current = await createTestSku({
      plan: 'plus',
      interval: 'monthly',
      price_minor_units: 500,
      provider_application_id: application,
    })
    const renewal = await createTestSku({
      plan: 'plus',
      interval: 'monthly',
      price_minor_units: 800,
      provider_application_id: application,
    })
    const ids: string[] = []
    for (let index = 0; index < 3; index++) {
      const user = await createTestUser()
      const expiresAt = new Date(Date.now() + 15 * 86_400_000)
      const membership = await createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: current.id,
        expiresAt,
        stripeSubscriptionId: `sub_${randomUUID()}`,
        providerEnvironment: 'production',
        providerApplicationId: application,
      })
      await attachTestStripeProductionProviderObservation({
        membership_id: membership.id,
        membership_provider_product_id: current.membership_provider_product_id,
        renewal_membership_provider_product_id: renewal.membership_provider_product_id,
        renewal_effective_at: expiresAt,
      })
      ids.push(membership.id)
    }
    overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })
    await expect(processRenewalNotificationCheckDispatcher({ afterId: ids[0] })).resolves.toEqual({
      hasMore: true,
    })
    const [continuation] = await memberships.searchJobs({
      name: MEMBERSHIPS_RENEWAL_CHECK_JOB.name,
      data: { afterId: ids[1] },
    })
    expect(continuation).toBeDefined()
    await expect(
      processRenewalNotificationCheckDispatcher(continuation!.data as { afterId?: string }),
    ).resolves.toEqual({ hasMore: true })
    const tailJobs = await memberships.searchJobs({
      name: MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB.name,
      data: { membershipId: ids[2] },
    })
    expect(tailJobs).toHaveLength(1)
  })
})
