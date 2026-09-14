import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type QueryResult = { rowCount: number | null }
type ProviderLineageTransition = 'fillAccount' | 'rewriteAccount' | 'rewriteLineage'
type LineageBindingTransition =
  | 'changeBoundAt'
  | 'changeLineage'
  | 'changeSourceKind'
  | 'changeUser'
  | 'clearUser'
  | 'delete'
  | 'release'
  | 'rewriteReason'
  | 'rewriteReleasedAt'
type GrantActivationTransition =
  | 'changeGrant'
  | 'changeStartedAt'
  | 'changeUser'
  | 'clearEndedAt'
  | 'delete'
  | 'endBeforeStart'
  | 'endAfterStart'
  | 'rewriteEndedAt'

export async function createTestNotificationFirstLineage(): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createNotificationFirstLineage */
    INSERT INTO membership_provider_lineages (
      provider, environment, application_id, provider_lineage_id
    ) VALUES (
      'apple_app_store', 'test', ${`lineage-immutability-${randomUUID()}`},
      ${`transaction-${randomUUID()}`}
    ) RETURNING id`)
  return rows[0]!.id
}

export function attemptTestProviderLineageTransition(
  lineageId: string,
  transition: ProviderLineageTransition,
): Promise<QueryResult> {
  switch (transition) {
    case 'fillAccount':
      return write(
        sql`/* fillTestProviderLineageAccount */ UPDATE membership_provider_lineages SET provider_account_id = 'account-token-one' WHERE id = ${lineageId}`,
      )
    case 'rewriteAccount':
      return write(
        sql`/* rewriteTestProviderLineageAccount */ UPDATE membership_provider_lineages SET provider_account_id = 'account-token-two' WHERE id = ${lineageId}`,
      )
    case 'rewriteLineage':
      return write(
        sql`/* rewriteTestProviderLineageId */ UPDATE membership_provider_lineages SET provider_lineage_id = ${`rewritten-${randomUUID()}`} WHERE id = ${lineageId}`,
      )
  }
}

export async function createTestImmutableLifecycleLineageBinding(
  userId: string,
): Promise<{ boundAt: Date; id: string }> {
  const { rows } = await write<{
    bound_at: Date
    id: string
  }>(sql`/* createImmutableTestLineageBinding */
    WITH lineage AS (INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id)
      VALUES ('stripe', 'test', 'binding-immutability', ${`lineage-${randomUUID()}`}) RETURNING id)
    INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
    SELECT id, ${userId} FROM lineage RETURNING id, bound_at`)
  return { boundAt: rows[0]!.bound_at, id: rows[0]!.id }
}

export function attemptTestLifecycleLineageBindingTransition(
  bindingId: string,
  transition: LineageBindingTransition,
): Promise<QueryResult> {
  switch (transition) {
    case 'changeBoundAt':
      return write(
        sql`/* changeTestLifecycleBindingBoundAt */ UPDATE membership_lineage_bindings SET bound_at = bound_at - INTERVAL '1 second' WHERE id = ${bindingId}`,
      )
    case 'changeUser':
      return write(
        sql`/* changeTestLifecycleBindingUser */ UPDATE membership_lineage_bindings SET user_id = ${randomUUID()} WHERE id = ${bindingId}`,
      )
    case 'changeLineage':
      return write(
        sql`/* changeTestLifecycleBindingLineage */ UPDATE membership_lineage_bindings SET membership_provider_lineage_id = ${randomUUID()} WHERE id = ${bindingId}`,
      )
    case 'changeSourceKind':
      return write(
        sql`/* changeTestLifecycleBindingSourceKind */ UPDATE membership_lineage_bindings SET source_kind = 'family' WHERE id = ${bindingId}`,
      )
    case 'delete':
      return write(
        sql`/* deleteTestLifecycleBinding */ DELETE FROM membership_lineage_bindings WHERE id = ${bindingId}`,
      )
    case 'release':
      return write(
        sql`/* releaseTestLifecycleBinding */ UPDATE membership_lineage_bindings SET released_at = CURRENT_TIMESTAMP, release_reason = 'account_hard_deleted' WHERE id = ${bindingId}`,
      )
    case 'rewriteReason':
      return write(
        sql`/* rewriteTestLifecycleBindingReason */ UPDATE membership_lineage_bindings SET release_reason = 'rewritten' WHERE id = ${bindingId}`,
      )
    case 'clearUser':
      return write(
        sql`/* clearTestLifecycleBindingUser */ UPDATE membership_lineage_bindings SET user_id = NULL WHERE id = ${bindingId}`,
      )
    case 'rewriteReleasedAt':
      return write(
        sql`/* rewriteTestLifecycleBindingReleasedAt */ UPDATE membership_lineage_bindings SET released_at = released_at + INTERVAL '1 second' WHERE id = ${bindingId}`,
      )
  }
}

export function deleteTestLifecycleUser(userId: string): Promise<QueryResult> {
  return write(sql`/* deleteTestLifecycleUser */ DELETE FROM users WHERE id = ${userId}`)
}

export async function getTestLifecycleLineageBinding(
  bindingId: string,
): Promise<{ bound_at: Date; release_reason: string; released_at: Date; user_id: string | null }> {
  const { rows } = await read<{
    bound_at: Date
    release_reason: string
    released_at: Date
    user_id: string | null
  }>(
    sql`/* getTestLifecycleLineageBinding */ SELECT bound_at, released_at, release_reason, user_id FROM membership_lineage_bindings WHERE id = ${bindingId}`,
  )
  return rows[0]!
}

export async function createTestGrantActivationPeriod(): Promise<string> {
  const { rows: products } = await read<{ id: string }>(
    sql`/* getTestGrantActivationProduct */ SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`,
  )
  const userId = randomUUID()
  const { rows } = await write<{ id: string }>(sql`/* createImmutableTestGrantActivation */
    WITH source AS (INSERT INTO membership_sources (user_id, source_kind) VALUES (${userId}, 'admin_grant') RETURNING id, user_id),
    grant_row AS (INSERT INTO membership_grants (membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot) SELECT id, user_id, ${products[0]!.id}, 30, 'Test issuer' FROM source RETURNING id, user_id)
    INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at) SELECT id, user_id, CURRENT_TIMESTAMP FROM grant_row RETURNING id`)
  return rows[0]!.id
}

export function attemptTestGrantActivationTransition(
  activationId: string,
  transition: GrantActivationTransition,
): Promise<QueryResult> {
  switch (transition) {
    case 'changeStartedAt':
      return write(
        sql`/* changeTestGrantActivationStartedAt */ UPDATE membership_grant_activation_periods SET started_at = started_at - INTERVAL '1 second' WHERE id = ${activationId}`,
      )
    case 'changeUser':
      return write(
        sql`/* changeTestGrantActivationUser */ UPDATE membership_grant_activation_periods SET user_id = ${randomUUID()} WHERE id = ${activationId}`,
      )
    case 'changeGrant':
      return write(
        sql`/* changeTestGrantActivationGrant */ UPDATE membership_grant_activation_periods SET membership_grant_id = ${randomUUID()} WHERE id = ${activationId}`,
      )
    case 'delete':
      return write(
        sql`/* deleteTestGrantActivation */ DELETE FROM membership_grant_activation_periods WHERE id = ${activationId}`,
      )
    case 'endBeforeStart':
      return write(
        sql`/* endTestGrantActivationBeforeStart */ UPDATE membership_grant_activation_periods SET ended_at = started_at - INTERVAL '1 second' WHERE id = ${activationId}`,
      )
    case 'endAfterStart':
      return write(
        sql`/* endTestGrantActivationAfterStart */ UPDATE membership_grant_activation_periods SET ended_at = started_at + INTERVAL '1 second' WHERE id = ${activationId}`,
      )
    case 'clearEndedAt':
      return write(
        sql`/* clearTestGrantActivationEndedAt */ UPDATE membership_grant_activation_periods SET ended_at = NULL WHERE id = ${activationId}`,
      )
    case 'rewriteEndedAt':
      return write(
        sql`/* rewriteTestGrantActivationEndedAt */ UPDATE membership_grant_activation_periods SET ended_at = ended_at + INTERVAL '1 second' WHERE id = ${activationId}`,
      )
  }
}
