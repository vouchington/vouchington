import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { decryptSecret } from '@modules/token-secrets'
import {
  encryptStripeMembershipEvidence,
  type StripeMembershipEvidenceEnvelope,
} from './membership-provider-evidence.mts'

describe('Stripe membership provider evidence', () => {
  it('keeps the complete original JSON for a bounded Stripe payload', () => {
    const eventId = 'evt_complete_membership_evidence'
    const subscription = makeSubscription(0)
    const encrypted = encryptStripeMembershipEvidence(subscription, eventId)

    expect(
      decryptSecret(encrypted.toString(), `membership-provider-evidence:stripe:${eventId}`),
    ).toBe(JSON.stringify(subscription))
  })

  it('keeps a bounded encrypted reconstruction envelope for a large Stripe payload', () => {
    const eventId = 'evt_membership_evidence'
    const subscription = makeSubscription()
    const encrypted = encryptStripeMembershipEvidence(subscription, eventId)
    const envelope = JSON.parse(
      decryptSecret(encrypted.toString(), `membership-provider-evidence:stripe:${eventId}`),
    ) as StripeMembershipEvidenceEnvelope

    expect(encrypted.byteLength).toBeLessThanOrEqual(65_536)
    expect(envelope.original).toEqual({
      byte_length: Buffer.byteLength(JSON.stringify(subscription)),
      sha256: createHash('sha256').update(JSON.stringify(subscription)).digest('hex'),
    })
    expect(envelope).toMatchObject({
      type: 'stripe_membership_provider_evidence',
      version: 2,
      subscription: {
        id: 'sub_membership_evidence',
        livemode: true,
        status: 'canceled',
        cancel_at_period_end: true,
        current_period_start: 1_741_398_400,
        current_period_end: 1_744_076_800,
        start_date: 1_700_000_000,
        cancel_at: 1_744_076_800,
        canceled_at: 1_743_000_000,
        ended_at: 1_743_000_100,
        item: {
          current_period_end: 1_744_076_800,
          price: {
            id: 'price_current',
            unit_amount: 875,
            currency: 'usd',
            recurring: { interval: 'month', interval_count: 1 },
          },
        },
        renewal_schedule: {
          effective_at: 1_744_076_800,
          price: {
            id: 'price_renewal',
            unit_amount: 1_500,
            currency: 'usd',
            recurring: { interval: 'month', interval_count: 1 },
          },
        },
      },
    })
    expect(JSON.stringify(envelope)).not.toContain('x'.repeat(100))
  })
})

function makeSubscription(metadataLength = 100_000): Stripe.Subscription {
  return {
    id: 'sub_membership_evidence',
    object: 'subscription',
    livemode: true,
    status: 'canceled',
    cancel_at_period_end: true,
    current_period_start: 1_741_398_400,
    current_period_end: 1_744_076_800,
    start_date: 1_700_000_000,
    cancel_at: 1_744_076_800,
    canceled_at: 1_743_000_000,
    ended_at: 1_743_000_100,
    items: {
      data: [
        {
          current_period_end: 1_744_076_800,
          price: makePrice('price_current', 875),
        },
      ],
    },
    schedule: {
      object: 'subscription_schedule',
      phases: [
        {
          start_date: 1_744_076_800,
          items: [{ price: makePrice('price_renewal', 1_500) }],
        },
      ],
    },
    metadata: { unrelated_payload: 'x'.repeat(metadataLength) },
  } as unknown as Stripe.Subscription
}

function makePrice(id: string, unitAmount: number): Stripe.Price {
  return {
    id,
    object: 'price',
    currency: 'usd',
    unit_amount: unitAmount,
    recurring: { interval: 'month', interval_count: 1 },
  } as Stripe.Price
}
