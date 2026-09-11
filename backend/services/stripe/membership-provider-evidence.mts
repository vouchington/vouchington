import { createHash } from 'node:crypto'
import { encryptSecret } from '@modules/token-secrets'
import type Stripe from 'stripe'

const MAX_ENCRYPTED_EVIDENCE_BYTES = 65_536
const MAX_FULL_EVIDENCE_PLAINTEXT_BYTES = 32_768
const MAX_ENVELOPE_STRING_LENGTH = 1_024

export type StripeMembershipEvidenceEnvelope = {
  type: 'stripe_membership_provider_evidence'
  version: 2
  original: { byte_length: number; sha256: string }
  subscription: StripeMembershipEvidenceSubscription
}

type StripeMembershipEvidenceSubscription = {
  id: string
  livemode: boolean
  status: string
  cancel_at_period_end: boolean
  current_period_start: number | null
  current_period_end: number | null
  start_date: number | null
  cancel_at: number | null
  canceled_at: number | null
  ended_at: number | null
  item: { current_period_end: number | null; price: StripeMembershipEvidencePrice | null }
  renewal_schedule:
    | { effective_at: number; price: StripeMembershipEvidencePrice | null }
    | { unexpanded: true }
    | null
}

type StripeMembershipEvidencePrice = {
  id: string | null
  unit_amount: number | null
  currency: string | null
  recurring: { interval: string | null; interval_count: number | null } | null
}

export function encryptStripeMembershipEvidence(
  subscription: Stripe.Subscription,
  stripeEventId: string,
): Buffer {
  const purpose = `membership-provider-evidence:stripe:${stripeEventId}`
  const original = JSON.stringify(subscription)
  if (Buffer.byteLength(original) <= MAX_FULL_EVIDENCE_PLAINTEXT_BYTES) {
    const encryptedEvidence = Buffer.from(encryptSecret(original, purpose))
    if (encryptedEvidence.byteLength <= MAX_ENCRYPTED_EVIDENCE_BYTES) return encryptedEvidence
  }
  const envelope: StripeMembershipEvidenceEnvelope = {
    type: 'stripe_membership_provider_evidence',
    version: 2,
    original: {
      byte_length: Buffer.byteLength(original),
      sha256: createHash('sha256').update(original).digest('hex'),
    },
    subscription: getEvidenceSubscription(subscription),
  }
  const boundedEvidence = Buffer.from(encryptSecret(JSON.stringify(envelope), purpose))
  if (boundedEvidence.byteLength > MAX_ENCRYPTED_EVIDENCE_BYTES)
    throw new Error('Stripe evidence encryption overhead exceeds the storage budget')
  return boundedEvidence
}

function getEvidenceSubscription(
  subscription: Stripe.Subscription,
): StripeMembershipEvidenceSubscription {
  const item = subscription.items.data[0]
  const currentPeriodEnd = getNumber(Reflect.get(subscription, 'current_period_end'))
  const itemPeriodEnd = item ? getNumber(Reflect.get(item, 'current_period_end')) : null
  const periodEnd = currentPeriodEnd ?? itemPeriodEnd
  return {
    id: getRequiredString(subscription.id, 'subscription.id'),
    livemode: subscription.livemode,
    status: getRequiredString(subscription.status, 'subscription.status'),
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_start: getNumber(Reflect.get(subscription, 'current_period_start')),
    current_period_end: currentPeriodEnd,
    start_date: getNumber(subscription.start_date),
    cancel_at: getNumber(subscription.cancel_at),
    canceled_at: getNumber(subscription.canceled_at),
    ended_at: getNumber(subscription.ended_at),
    item: {
      current_period_end: itemPeriodEnd,
      price: getEvidencePrice(item?.price),
    },
    renewal_schedule: getRenewalSchedule(subscription.schedule, periodEnd),
  }
}

function getRenewalSchedule(
  schedule: Stripe.Subscription['schedule'],
  periodEnd: number | null,
): StripeMembershipEvidenceSubscription['renewal_schedule'] {
  if (schedule == null) return null
  if (typeof schedule === 'string') return { unexpanded: true }
  if (periodEnd === null) return null
  const phase = schedule.phases.find(candidate => candidate.start_date === periodEnd)
  if (!phase) return null
  return { effective_at: periodEnd, price: getEvidencePrice(phase.items[0]?.price) }
}

function getEvidencePrice(price: unknown): StripeMembershipEvidencePrice | null {
  if (typeof price !== 'object' || price === null || Array.isArray(price)) return null
  const candidate = price as Record<string, unknown>
  const recurring = getRecurringPrice(candidate.recurring)
  return {
    id: getOptionalString(candidate.id, 'price.id'),
    unit_amount: getNumber(candidate.unit_amount),
    currency: getOptionalString(candidate.currency, 'price.currency'),
    recurring,
  }
}

function getRecurringPrice(recurring: unknown): StripeMembershipEvidencePrice['recurring'] {
  if (typeof recurring !== 'object' || recurring === null || Array.isArray(recurring)) return null
  const candidate = recurring as Record<string, unknown>
  return {
    interval: getOptionalString(candidate.interval, 'price.recurring.interval'),
    interval_count: getNumber(candidate.interval_count),
  }
}

function getRequiredString(value: unknown, field: string): string {
  const result = getOptionalString(value, field)
  if (result === null) throw new Error(`Stripe evidence ${field} must be a non-empty string`)
  return result
}

function getOptionalString(value: unknown, field: string): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  if (value.length > MAX_ENVELOPE_STRING_LENGTH)
    throw new Error(`Stripe evidence ${field} exceeds the bounded envelope limit`)
  return value
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
