import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type QueryResult = { rowCount: number | null }

export async function getGrantClockTestProductId(): Promise<string> {
  const { rows } = await read<{ id: string }>(`/* getGrantClockTestProduct */
    SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
  return rows[0]!.id
}

export async function createGrantClockTestSource(userId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`
    /* createGrantClockTestSource */
    INSERT INTO membership_sources (user_id, source_kind)
    VALUES (${userId}, 'admin_grant') RETURNING id`)
  return rows[0]!.id
}

export function insertPreEffectiveMembershipSourceState(
  sourceId: string,
  productId: string,
): Promise<QueryResult> {
  return write(sql`/* rejectPreEffectiveMembershipSourceExpiry */
    INSERT INTO membership_source_states (
      membership_source_id, source_kind, membership_product_id, effective_at, expires_at
    ) VALUES (
      ${sourceId}, 'admin_grant', ${productId},
      '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    )`)
}

export function createGrantClockTestSourceState(
  sourceId: string,
  productId: string,
): Promise<QueryResult> {
  return write(sql`/* createGrantClockTestSourceState */
    INSERT INTO membership_source_states (
      membership_source_id, source_kind, membership_product_id, effective_at
    ) VALUES (${sourceId}, 'admin_grant', ${productId}, '2026-01-01T00:00:00.000Z')`)
}

export function insertParallelMembershipSourceStates(sourceId: string): Promise<QueryResult> {
  return write(sql`/* rejectParallelMembershipSourceStates */
    UPDATE membership_source_states
    SET cancelled_at = '2026-01-02T00:00:00.000Z', paused_at = '2026-01-02T00:00:00.000Z'
    WHERE membership_source_id = ${sourceId}`)
}

export async function createGrantDurationTestGrant(
  sourceId: string,
  userId: string,
  productId: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createGrantDurationTestGrant */
    INSERT INTO membership_grants (
      membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot
    ) VALUES (${sourceId}, ${userId}, ${productId}, 10, 'schema test')
    RETURNING id`)
  return rows[0]!.id
}

export function createGrantDurationTestActivation(
  grantId: string,
  userId: string,
): Promise<QueryResult> {
  return write(sql`/* createGrantDurationTestActivation */
    INSERT INTO membership_grant_activation_periods (
      membership_grant_id, user_id, started_at, ended_at
    ) VALUES (
      ${grantId}, ${userId}, '2026-01-01T00:00:00.000Z', '2026-01-04T00:00:00.000Z'
    )`)
}

export async function getGrantDurationTestRemainingSeconds(grantId: string): Promise<string> {
  const { rows } = await read<{ remaining_seconds: string }>(sql`
    /* getGrantDurationTestRemainingSeconds */
    SELECT EXTRACT(EPOCH FROM membership_grant_remaining_duration(${grantId}))::bigint
      AS remaining_seconds`)
  return rows[0]!.remaining_seconds
}
