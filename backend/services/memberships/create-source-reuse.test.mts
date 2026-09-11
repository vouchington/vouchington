import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { getStripeMembershipSourceIdentity } from './create-types.mts'
import { getMembershipByStripeSubscriptionId, getMembershipHistory } from './get.mts'

describe('createMembership provider-source reuse', () => {
  it('keeps the effective projection and initial audit row for the same provider source', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_reuse_${randomUUID()}`
    const sourceIdentity = getStripeMembershipSourceIdentity({
      stripeSubscriptionId: subscriptionId,
    })
    const first = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeEventId: `evt_checkout_${randomUUID()}`,
    })
    const initial = (await getTestMembershipRaw(first.id))!
    const initialProjection = (await getMembershipByStripeSubscriptionId(sourceIdentity))!

    const replay = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeEventId: `evt_invoice_${randomUUID()}`,
    })

    expect(replay.id).toBe(first.id)
    await expect(getMembershipByStripeSubscriptionId(sourceIdentity)).resolves.toMatchObject({
      started_at: initialProjection.started_at,
    })
    await expect(getTestMembershipRaw(first.id)).resolves.toMatchObject({
      source_effective_at: initial.source_effective_at,
    })
    await expect(getTestMembershipRaw(first.id)).resolves.toMatchObject({
      id: first.id,
      projection_ended_at: null,
      stripe_subscription_id: subscriptionId,
    })
    await expect(getMembershipHistory(user.id)).resolves.toEqual([
      expect.objectContaining({
        membership_id: first.id,
        change_type: 'renewal',
      }),
    ])
  })

  it('serializes concurrent creation on the durable provider source', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_race_${randomUUID()}`
    const create = (stripeEventId: string) =>
      createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: subscriptionId,
        stripeEventId,
      })

    const [checkout, invoice] = await Promise.all([
      create(`evt_checkout_${randomUUID()}`),
      create(`evt_invoice_${randomUUID()}`),
    ])

    expect(invoice.id).toBe(checkout.id)
    await expect(getMembershipHistory(user.id)).resolves.toHaveLength(1)
    await expect(getTestMembershipRaw(checkout.id)).resolves.toMatchObject({
      id: checkout.id,
      projection_ended_at: null,
      stripe_subscription_id: subscriptionId,
    })
  })

  it('reconciles newer state in place for a source discovered after preflight', async () => {
    const user = await createTestUser()
    const plus = await createTestSku({ plan: 'plus' })
    const pro = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_reconcile_${randomUUID()}`
    const first = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: plus.id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: subscriptionId,
      stripeEventId: `evt_checkout_${randomUUID()}`,
    })

    const reconciled = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: pro.id,
      status: 'past_due',
      expiresAt: new Date('2030-02-01T00:00:00.000Z'),
      stripeSubscriptionId: subscriptionId,
      stripeEventId: `evt_invoice_${randomUUID()}`,
    })

    expect(reconciled.id).toBe(first.id)
    await expect(getTestMembershipRaw(first.id)).resolves.toMatchObject({
      plan: 'pro',
      sku_id: pro.id,
      expires_at: new Date('2030-02-01T00:00:00.000Z'),
      past_due_at: expect.any(Date),
      source_auto_renews: true,
    })
    await expect(getMembershipHistory(user.id)).resolves.toHaveLength(2)
  })

  it('resolves provider evidence when reconciling an existing source', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_reconcile_evidence_${randomUUID()}`
    const first = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      providerApplicationId: sku.provider_application_id,
    })
    const observation = await attachTestStripeProductionProviderObservation({
      membership_id: first.id,
      membership_provider_product_id: sku.membership_provider_product_id,
    })

    await createMembership(
      {
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        status: 'past_due',
        stripeSubscriptionId: subscriptionId,
        providerApplicationId: sku.provider_application_id,
      },
      {
        getMembershipProviderEvidence: async membership => {
          expect(membership.id).toBe(first.id)
          return {
            membershipProviderEvidenceId: observation.membership_provider_evidence_id,
          }
        },
      },
    )

    await expect(getMembershipHistory(user.id)).resolves.toEqual([
      expect.objectContaining({
        change_type: 'renewal',
        membership_provider_evidence_id: observation.membership_provider_evidence_id,
      }),
      expect.objectContaining({
        change_type: 'renewal',
        membership_provider_evidence_id: null,
      }),
    ])
  })
})
