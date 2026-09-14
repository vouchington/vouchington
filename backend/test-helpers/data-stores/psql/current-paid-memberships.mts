import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CurrentPaidMembership = { user_id: string; plan: 'plus' | 'pro' }
export type MembershipViewStatus = { status: 'active' | 'expired' | 'past_due'; user_id: string }
export type MembershipBillingIdentity = {
  expires_at: Date | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  user_id: string
}
export type PrivateUserMembership = { id: string; membership_plan: 'plus' | 'pro' | null }

export async function getCurrentPaidMembershipTestProducts(): Promise<Array<{ id: string }>> {
  const { rows } = await read<{ id: string }>(sql`/* getCurrentPaidMembershipViewProducts */
    SELECT id FROM membership_products WHERE billing_interval = 'monthly'
      AND retired_at IS NULL AND plan IN ('plus', 'pro') ORDER BY plan`)
  return rows
}

export async function createStaleProviderMembershipSource(
  userId: string,
  productId: string,
  expiresAt: Date,
  sourceKind: 'direct' | 'family',
  pastDue = false,
): Promise<void> {
  const providerLineageId = `view-current-paid-${randomUUID()}`
  await write(sql`/* createStaleProviderMembershipSource */
    WITH lineage AS (INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id, provider_account_id)
      VALUES ('stripe', 'test', 'view-current-paid-test', ${providerLineageId}, ${`account-${randomUUID()}`}) RETURNING id),
    binding AS (INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id) SELECT id, ${userId} FROM lineage),
    source AS (INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id) SELECT ${userId}, ${sourceKind}, id FROM lineage RETURNING id, membership_provider_lineage_id),
    state AS (INSERT INTO membership_source_states (membership_source_id, source_kind, membership_provider_lineage_id, membership_product_id, effective_at, expires_at, past_due_at)
      SELECT id, ${sourceKind}, membership_provider_lineage_id, ${productId}, ${expiresAt}::timestamptz - INTERVAL '30 days', ${expiresAt}, CASE WHEN ${pastDue} THEN CURRENT_TIMESTAMP END FROM source)
    INSERT INTO memberships (user_id, membership_source_id, membership_product_id, effective_at, expires_at, past_due_at)
    SELECT ${userId}, id, ${productId}, ${expiresAt}::timestamptz - INTERVAL '30 days', ${expiresAt}, CASE WHEN ${pastDue} THEN CURRENT_TIMESTAMP END FROM source`)
}

export async function createElapsedAdminGrantForCurrentPaidMembershipView(
  userId: string,
  productId: string,
  expiresAt: Date,
  pastDue = false,
): Promise<void> {
  await write(sql`/* createElapsedAdminGrantForCurrentPaidMembershipView */
    WITH source AS (INSERT INTO membership_sources (user_id, source_kind) VALUES (${userId}, 'admin_grant') RETURNING id),
    state AS (INSERT INTO membership_source_states (membership_source_id, source_kind, membership_product_id, effective_at, expires_at, past_due_at)
      SELECT id, 'admin_grant', ${productId}, ${expiresAt}::timestamptz - INTERVAL '30 days', ${expiresAt}, CASE WHEN ${pastDue} THEN CURRENT_TIMESTAMP END FROM source),
    grant_row AS (INSERT INTO membership_grants (membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot)
      SELECT id, ${userId}, ${productId}, 30, 'current paid membership view test' FROM source RETURNING id),
    activation AS (INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at)
      SELECT id, ${userId}, ${expiresAt}::timestamptz - INTERVAL '30 days' FROM grant_row)
    INSERT INTO memberships (user_id, membership_source_id, membership_product_id, effective_at, expires_at, past_due_at)
    SELECT ${userId}, id, ${productId}, ${expiresAt}::timestamptz - INTERVAL '30 days', ${expiresAt}, CASE WHEN ${pastDue} THEN CURRENT_TIMESTAMP END FROM source`)
}

export async function getCurrentPaidMemberships(
  userIds: string[],
): Promise<CurrentPaidMembership[]> {
  const { rows } = await read<CurrentPaidMembership>(sql`/* getStaleCurrentPaidMemberships */
    SELECT user_id, plan FROM view_current_paid_memberships WHERE user_id = ANY(${userIds}) ORDER BY user_id`)
  return rows
}

export async function getMembershipStatuses(userIds: string[]): Promise<MembershipViewStatus[]> {
  const { rows } = await read<MembershipViewStatus>(sql`/* getElapsedMembershipSourceStatuses */
    SELECT user_id, status FROM view_memberships WHERE user_id = ANY(${userIds})`)
  return rows
}

export async function getMembershipBillingIdentities(
  userIds: string[],
): Promise<MembershipBillingIdentity[]> {
  const { rows } = await read<MembershipBillingIdentity>(sql`/* getMembershipBillingIdentities */
    SELECT user_id, expires_at, stripe_subscription_id, stripe_customer_id FROM view_memberships
    WHERE user_id = ANY(${userIds}) ORDER BY user_id`)
  return rows
}

export async function getPrivateUserMemberships(
  userIds: string[],
): Promise<PrivateUserMembership[]> {
  const { rows } = await read<PrivateUserMembership>(sql`/* getStalePrivateUserMemberships */
    SELECT id, membership_plan FROM view_users_private WHERE id = ANY(${userIds})
    ORDER BY membership_plan IS NULL, id`)
  return rows
}
