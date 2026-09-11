import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'
import { claimMembershipRefundIntent } from './refund-intents.mts'
import {
  createRefundRequestFingerprint,
  createStripeRefundIdempotencyKey,
  type MembershipRefundRequestIntent,
} from './refund-idempotency.mts'
import { recordMembershipRefundWebhook } from './refunds.mts'
import { getMembershipSourceIdByMembershipId } from './get.mts'

type Scenario = Awaited<ReturnType<typeof createScenarioWithUnkeyedWebhookReceipt>>

function invoice(chargeId: string, currency = 'usd', invoiceId = 'in_intent_reread') {
  return [
    {
      status: 'paid' as const,
      id: invoiceId,
      amountPaid: 1000,
      currency,
      created: 1_700_000_000,
      description: null,
      payments: [
        {
          amountPaid: 1000,
          payment: { type: 'charge' as const, chargeId, paymentIntentId: null },
        },
      ],
    },
  ]
}

async function createScenarioWithUnkeyedWebhookReceipt(originalHasSubscription = true) {
  const actor = await createTestUser()
  const target = await createTestUser()
  const suffix = randomUUID()
  const chargeId = `ch_intent_reread_${suffix}`
  const originalSubscriptionId = originalHasSubscription ? `sub_intent_original_${suffix}` : null
  const currentSubscriptionId = `sub_intent_current_${suffix}`
  const original = await createTestMembership({
    user_id: target.id,
    status: 'expired',
    stripe_subscription_id: originalSubscriptionId,
  })
  const originalMembershipSourceId = (await getMembershipSourceIdByMembershipId(original.id))!
  const current = await createTestMembership({
    user_id: target.id,
    stripe_subscription_id: currentSubscriptionId,
  })
  const options: MembershipRefundRequestIntent = {
    targetUserId: target.id,
    chargeId,
    paymentIntentId: null,
    invoiceId: 'in_intent_reread',
    reason: 'requested',
    cancel: false,
    amount: { amount: 1000, currency: 'usd' },
    idempotencyToken: randomUUID(),
  }
  const stripeIdempotencyKey = createStripeRefundIdempotencyKey(actor.id, options.idempotencyToken)
  await recordMembershipRefundWebhook({
    membershipId: current.id,
    membershipSourceId: current.membership_source_id,
    userId: target.id,
    stripeRefundId: `re_intent_reread_existing_${suffix}`,
    stripeChargeId: chargeId,
    stripePaymentIntentId: null,
    amount: { amount: 1000, currency: 'usd' },
    stripeEventId: `evt_intent_reread_${suffix}`,
  })
  return {
    actor,
    target,
    chargeId,
    original,
    originalMembershipSourceId,
    originalSubscriptionId,
    currentSubscriptionId,
    options,
    stripeIdempotencyKey,
    suffix,
  }
}

function makeOperations(
  scenario: Scenario,
  intentInvoices: ReturnType<typeof invoice>,
): {
  createRefundCalls: Parameters<MembershipStripeOperations['createRefund']>[0][]
  listSubscriptionIds: string[]
  operations: MembershipStripeOperations
} {
  const listSubscriptionIds: string[] = []
  const createRefundCalls: Parameters<MembershipStripeOperations['createRefund']>[0][] = []
  return {
    createRefundCalls,
    listSubscriptionIds,
    operations: {
      listSubscriptionInvoices: async ({ subscriptionId }) => {
        listSubscriptionIds.push(subscriptionId)
        if (listSubscriptionIds.length === 1) {
          await claimMembershipRefundIntent({
            membershipId: scenario.original.id,
            membershipSourceId: scenario.originalMembershipSourceId,
            issuedById: scenario.actor.id,
            stripeIdempotencyKey: scenario.stripeIdempotencyKey,
            requestFingerprint: createRefundRequestFingerprint(
              scenario.original.id,
              scenario.options,
            ),
          })
          return invoice(scenario.chargeId)
        }
        return intentInvoices
      },
      createRefund: async payload => {
        createRefundCalls.push(payload)
        return {
          id: `re_intent_reread_created_${scenario.suffix}`,
          chargeId: scenario.chargeId,
          paymentIntentId: null,
          amount: 1000,
          currency: 'usd',
        }
      },
      cancelSubscriptionImmediately: async () => null,
    },
  }
}

describe('membership refund concurrent intent reread', () => {
  it('replays against the concurrent intent original membership', async () => {
    const scenario = await createScenarioWithUnkeyedWebhookReceipt()
    const harness = makeOperations(scenario, invoice(scenario.chargeId))

    const result = await refundMembership(scenario.actor.id, scenario.options, harness.operations)

    expect(result.membership_id).toBe(scenario.original.id)
    expect(harness.listSubscriptionIds).toEqual([
      scenario.currentSubscriptionId,
      scenario.originalSubscriptionId,
    ])
    expect(harness.createRefundCalls).toEqual([
      {
        chargeId: scenario.chargeId,
        paymentIntentId: undefined,
        amountMinorUnits: 1000,
        idempotencyKey: scenario.stripeIdempotencyKey,
      },
    ])
  })

  it('rejects when the concurrent intent original membership has no Stripe subscription', async () => {
    const scenario = await createScenarioWithUnkeyedWebhookReceipt(false)
    const harness = makeOperations(scenario, invoice(scenario.chargeId))

    await expect(
      refundMembership(scenario.actor.id, scenario.options, harness.operations),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Not a Stripe subscription',
    })
    expect(harness.listSubscriptionIds).toEqual([scenario.currentSubscriptionId])
    expect(harness.createRefundCalls).toEqual([])
  })

  it('rejects when the concurrent intent original membership has no matching charge', async () => {
    const scenario = await createScenarioWithUnkeyedWebhookReceipt()
    const harness = makeOperations(scenario, invoice(`ch_intent_reread_other_${scenario.suffix}`))

    await expect(
      refundMembership(scenario.actor.id, scenario.options, harness.operations),
    ).rejects.toMatchObject({
      status: 400,
      message: 'No refundable charge found for membership',
    })
    expect(harness.listSubscriptionIds).toEqual([
      scenario.currentSubscriptionId,
      scenario.originalSubscriptionId,
    ])
    expect(harness.createRefundCalls).toEqual([])
  })

  it('rejects when the concurrent intent original membership charge currency changed', async () => {
    const scenario = await createScenarioWithUnkeyedWebhookReceipt()
    const harness = makeOperations(scenario, invoice(scenario.chargeId, 'eur'))

    await expect(
      refundMembership(scenario.actor.id, scenario.options, harness.operations),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Refund currency must match the refundable charge currency',
    })
    expect(harness.listSubscriptionIds).toEqual([
      scenario.currentSubscriptionId,
      scenario.originalSubscriptionId,
    ])
    expect(harness.createRefundCalls).toEqual([])
  })
})
