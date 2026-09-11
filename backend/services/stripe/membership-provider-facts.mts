import { createHash } from 'node:crypto'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import type Stripe from 'stripe'
import sql from 'sql-template-strings'
import { encryptStripeMembershipEvidence } from './membership-provider-evidence.mts'
import {
  getAuthoritativeStripeMembershipSnapshot,
  StripeProviderFactVerdictError,
} from './membership-provider-facts/snapshot.mts'
import { insertStripeMembershipObservation } from './membership-provider-facts/observation.mts'
import {
  getLockedMembershipFact,
  MissingStripeMembershipFactContextError,
  type MembershipFact,
} from './membership-provider-facts/context.mts'
import { getStripeSubscriptionCustomerId } from './membership-sync/transaction.mts'

type StripeProviderFacts = { evidenceId: string; observationId: string | null }

type VerifiedStripeEvidence = StripeProviderFacts & { isNew: boolean }

export async function recordStripeMembershipProviderFacts(options: {
  stripeEventId: string
  membershipId: string
  subscription: Stripe.Subscription
  observedAt?: Date
  onLockedSource?: (query: QueryExecutor) => Promise<void>
  onAcceptedObservation?: (
    query: QueryExecutor,
    lifecycleAt: Date,
    evidenceId: string,
    snapshot: Awaited<ReturnType<typeof getAuthoritativeStripeMembershipSnapshot>>,
  ) => Promise<void>
}): Promise<StripeProviderFacts> {
  await using transaction = await beginTransaction()
  const facts = await recordStripeMembershipProviderFactsInTransaction(
    options,
    options.subscription,
    transaction,
  )
  await transaction.commit()
  return facts
}

export async function recordStripeMembershipProviderFactsInTransaction(
  options: {
    stripeEventId: string
    membershipId: string
    observedAt?: Date
    onLockedSource?: (query: QueryExecutor) => Promise<void>
    onAcceptedObservation?: (
      query: QueryExecutor,
      lifecycleAt: Date,
      evidenceId: string,
      snapshot: Awaited<ReturnType<typeof getAuthoritativeStripeMembershipSnapshot>>,
    ) => Promise<void>
  },
  subscription: Stripe.Subscription,
  query: QueryExecutor,
): Promise<StripeProviderFacts> {
  const fact = await getLockedMembershipFact(options, query)
  if (!fact)
    throw new MissingStripeMembershipFactContextError(
      `Membership ${options.membershipId} has no Stripe fact context for event ${options.stripeEventId}`,
    )
  if (subscription.livemode !== fact.livemode) {
    throw new StripeProviderFactVerdictError(
      `Stripe event ${options.stripeEventId} livemode disagrees with subscription`,
    )
  }
  if (fact.livemode !== (fact.environment === 'production')) {
    throw new StripeProviderFactVerdictError(
      `Stripe event ${options.stripeEventId} livemode disagrees with the membership source`,
    )
  }
  if (subscription.id !== fact.provider_lineage_id || fact.subscription_id !== subscription.id)
    throw new StripeProviderFactVerdictError(
      `Stripe event ${options.stripeEventId} subscription does not match the membership source`,
    )
  await options.onLockedSource?.(query)
  const observedAt = options.observedAt ?? new Date()
  const subscriptionCustomerId = getStripeSubscriptionCustomerId(subscription)
  if (
    subscriptionCustomerId &&
    (subscriptionCustomerId !== fact.customer_id ||
      (fact.provider_account_id !== null && subscriptionCustomerId !== fact.provider_account_id))
  )
    throw new StripeProviderFactVerdictError(
      `Stripe event ${options.stripeEventId} customer does not match the membership source`,
    )
  const evidence = await upsertVerifiedEvidence(options.stripeEventId, fact, subscription, query)
  if (!evidence.isNew) {
    return { evidenceId: evidence.evidenceId, observationId: evidence.observationId }
  }
  const snapshot = await getAuthoritativeStripeMembershipSnapshot(
    subscription,
    fact,
    observedAt,
    query,
  )
  const observationId = await insertObservationAndApplyProjection(
    options,
    fact,
    snapshot,
    observedAt,
    evidence.evidenceId,
    query,
  )
  return { evidenceId: evidence.evidenceId, observationId }
}

async function insertObservationAndApplyProjection(
  options: {
    stripeEventId: string
    onAcceptedObservation?: (
      query: QueryExecutor,
      lifecycleAt: Date,
      evidenceId: string,
      snapshot: Awaited<ReturnType<typeof getAuthoritativeStripeMembershipSnapshot>>,
    ) => Promise<void>
  },
  fact: MembershipFact,
  snapshot: Awaited<ReturnType<typeof getAuthoritativeStripeMembershipSnapshot>>,
  observedAt: Date,
  evidenceId: string,
  query: QueryExecutor,
): Promise<string | null> {
  const observationId = await insertStripeMembershipObservation(
    evidenceId,
    options.stripeEventId,
    fact,
    snapshot,
    observedAt,
    query,
  )
  const lifecycleAt = snapshot.reconciliationAt
  if (observationId) await options.onAcceptedObservation?.(query, lifecycleAt, evidenceId, snapshot)
  return observationId
}

async function upsertVerifiedEvidence(
  eventId: string,
  fact: MembershipFact,
  subscription: Stripe.Subscription,
  query: QueryExecutor,
): Promise<VerifiedStripeEvidence> {
  const environment = subscription.livemode ? 'production' : 'test'
  const evidenceLookupSha256 = createHash('sha256')
    .update(`stripe:membership-event:${environment}:${eventId}`)
    .digest('hex')
  const encryptedEvidence = encryptStripeMembershipEvidence(subscription, eventId)
  const { rows } = await query(sql`/* upsertVerifiedStripeMembershipEvidence */
    INSERT INTO membership_provider_evidence_records (
      provider, environment, application_id, membership_provider_lineage_id,
      provider_event_id, evidence_lookup_sha256, encrypted_evidence, received_at, verified_at
    ) VALUES ('stripe', ${environment}, ${fact.application_id},
      ${fact.membership_provider_lineage_id}, ${eventId}, ${evidenceLookupSha256},
      ${encryptedEvidence}, ${fact.received_at}, CURRENT_TIMESTAMP)
    ON CONFLICT (provider, environment, application_id, provider_event_id)
      WHERE provider_event_id IS NOT NULL DO NOTHING
    RETURNING id
  `)
  if (rows[0]) {
    return { evidenceId: (rows[0] as { id: string }).id, observationId: null, isNew: true }
  }
  const { rows: existingRows } = await query(sql`/* getVerifiedStripeMembershipEvidence */
    SELECT evidence.id, observation.id AS observation_id
    FROM membership_provider_evidence_records evidence
    LEFT JOIN membership_provider_observations observation
      ON observation.membership_provider_evidence_id = evidence.id
    WHERE evidence.provider = 'stripe' AND evidence.environment = ${environment}
      AND evidence.application_id = ${fact.application_id} AND evidence.provider_event_id = ${eventId}
      AND evidence.membership_provider_lineage_id = ${fact.membership_provider_lineage_id}
      AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
    FOR KEY SHARE OF evidence
  `)
  const existing = existingRows[0] as { id: string; observation_id: string | null } | undefined
  if (!existing)
    throw new Error(`Stripe evidence ${eventId} was rejected or belongs to another lineage`)
  return { evidenceId: existing.id, observationId: existing.observation_id, isNew: false }
}
