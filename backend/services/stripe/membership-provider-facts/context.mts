import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type MembershipFact = {
  user_id: string
  membership_source_id: string
  membership_provider_lineage_id: string
  application_id: string
  environment: 'test' | 'production'
  membership_product_id: string
  effective_at: Date
  expires_at: Date | null
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
  auto_renews: boolean
  received_at: Date
  livemode: boolean
  provider_lineage_id: string
  subscription_id: string | null
  customer_id: string | null
  provider_account_id: string | null
}

export class MissingStripeMembershipFactContextError extends Error {
  override name = 'MissingStripeMembershipFactContextError'
}

export class StripeMembershipEventNotIngestedError extends Error {
  override name = 'StripeMembershipEventNotIngestedError'
}

export async function getLockedMembershipFact(
  options: { stripeEventId: string; membershipId: string },
  query: QueryExecutor,
): Promise<MembershipFact | null> {
  await assertStripeMembershipEventIngested(options.stripeEventId, query)
  await lockMembershipFactUser(options.membershipId, query)
  return getMembershipFact(options, query)
}

async function assertStripeMembershipEventIngested(
  stripeEventId: string,
  query: QueryExecutor,
): Promise<void> {
  const { rows } = await query(
    sql`/* assertStripeMembershipEventIngested */ SELECT 1 FROM stripe_events WHERE stripe_event_id = ${stripeEventId}`,
  )
  if (!rows[0])
    throw new StripeMembershipEventNotIngestedError(
      `Stripe event ${stripeEventId} was not durably ingested`,
    )
}

async function lockMembershipFactUser(membershipId: string, query: QueryExecutor): Promise<void> {
  await query(sql`/* recordStripeMembershipProviderFacts: lock user before source state */
    SELECT member_user.id
    FROM memberships membership
    INNER JOIN users member_user ON member_user.id = membership.user_id
    WHERE membership.id = ${membershipId}
    FOR UPDATE OF member_user
  `)
}

async function getMembershipFact(
  options: { stripeEventId: string; membershipId: string },
  query: QueryExecutor,
): Promise<MembershipFact | null> {
  const { rows } = await query(sql`/* getStripeMembershipProviderFact */
    SELECT membership.user_id, source.id AS membership_source_id, source.membership_provider_lineage_id,
      lineage.application_id, lineage.environment, lineage.provider_lineage_id, lineage.provider_account_id, state.membership_product_id,
      state.effective_at, state.expires_at, state.cancelled_at, state.expired_at, state.past_due_at, state.paused_at,
      state.auto_renews, event.received_at, event.livemode,
      event.subscription_id, event.customer_id
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_source_states state ON state.membership_source_id = source.id
    INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN stripe_events event ON event.stripe_event_id = ${options.stripeEventId}
    WHERE membership.id = ${options.membershipId}
      AND source.source_kind = 'direct'
      AND lineage.provider = 'stripe'
    /* deadlock-safe: membership.id reaches one source and its one current state */
    FOR UPDATE OF source, state
  `)
  return (rows[0] as MembershipFact | undefined) ?? null
}
