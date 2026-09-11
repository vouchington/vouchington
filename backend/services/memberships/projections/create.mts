import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isTerminalMembershipStatus } from '../update-result.mts'
import type { MembershipStatus } from '../types.mts'

type Source = {
  id: string
  kind: 'admin_grant' | 'direct' | 'family'
  lineageId: string | null
  membershipProviderObservationId?: string
}

type LifecycleTiming = {
  authoritativeEffectiveAt: Date | null
  effectiveAt: Date
  expiresAt: Date | null
  terminalEffectiveAt: Date | null
  transitionEffectiveAt: Date | null
}

export async function upsertMembershipSourceState(
  source: Source,
  productId: string,
  status: MembershipStatus,
  timing: LifecycleTiming,
  autoRenews: boolean,
  query: QueryExecutor,
): Promise<{ advanced: boolean; effectiveAt: Date | null }> {
  const { rows } = await query(sql`/* createMembership: source state */
    INSERT INTO membership_source_states (
      membership_source_id, source_kind, membership_provider_lineage_id,
      membership_provider_observation_id, membership_product_id, effective_at, expires_at,
      cancelled_at, expired_at, past_due_at, paused_at, auto_renews
    ) VALUES (
      ${source.id}, ${source.kind}, ${source.lineageId},
      ${source.membershipProviderObservationId ?? null}, ${productId}, ${timing.effectiveAt}, ${timing.expiresAt},
      CASE WHEN ${status} = 'cancelled' THEN ${timing.terminalEffectiveAt}::timestamptz ELSE NULL END,
      CASE WHEN ${status} = 'expired' THEN ${timing.terminalEffectiveAt}::timestamptz ELSE NULL END,
      CASE WHEN ${status} = 'past_due' THEN ${timing.transitionEffectiveAt}::timestamptz ELSE NULL END,
      CASE WHEN ${status} = 'paused' THEN ${timing.transitionEffectiveAt}::timestamptz ELSE NULL END,
      ${source.kind === 'direct' && !isTerminalMembershipStatus(status) && autoRenews}
    ) ON CONFLICT (membership_source_id) DO UPDATE SET
      source_kind = EXCLUDED.source_kind,
      membership_provider_lineage_id = EXCLUDED.membership_provider_lineage_id,
      membership_provider_observation_id = CASE
        WHEN ${source.membershipProviderObservationId ?? null}::uuid IS NOT NULL
          THEN ${source.membershipProviderObservationId ?? null}::uuid
        WHEN membership_source_states.membership_provider_lineage_id
          IS NOT DISTINCT FROM EXCLUDED.membership_provider_lineage_id
          AND membership_source_states.membership_product_id = EXCLUDED.membership_product_id
          THEN membership_source_states.membership_provider_observation_id
        ELSE NULL
      END,
      membership_product_id = EXCLUDED.membership_product_id,
      effective_at = LEAST(
        CASE
          WHEN ${timing.authoritativeEffectiveAt}::timestamptz IS NULL
            THEN LEAST(membership_source_states.effective_at, EXCLUDED.effective_at)
          ELSE EXCLUDED.effective_at
        END,
        CASE
          WHEN EXCLUDED.cancelled_at IS NOT NULL
            THEN COALESCE(membership_source_states.cancelled_at, EXCLUDED.cancelled_at)
          WHEN EXCLUDED.expired_at IS NOT NULL
            THEN COALESCE(membership_source_states.expired_at, EXCLUDED.expired_at)
          WHEN EXCLUDED.past_due_at IS NOT NULL
            THEN COALESCE(membership_source_states.past_due_at, EXCLUDED.past_due_at)
          WHEN EXCLUDED.paused_at IS NOT NULL
            THEN COALESCE(membership_source_states.paused_at, EXCLUDED.paused_at)
          ELSE EXCLUDED.effective_at
        END
      ),
      expires_at = EXCLUDED.expires_at,
      cancelled_at = CASE WHEN EXCLUDED.cancelled_at IS NULL THEN NULL ELSE COALESCE(membership_source_states.cancelled_at, EXCLUDED.cancelled_at) END,
      expired_at = CASE WHEN EXCLUDED.expired_at IS NULL THEN NULL ELSE COALESCE(membership_source_states.expired_at, EXCLUDED.expired_at) END,
      past_due_at = CASE WHEN EXCLUDED.past_due_at IS NULL THEN NULL ELSE COALESCE(membership_source_states.past_due_at, EXCLUDED.past_due_at) END,
      paused_at = CASE WHEN EXCLUDED.paused_at IS NULL THEN NULL ELSE COALESCE(membership_source_states.paused_at, EXCLUDED.paused_at) END,
      auto_renews = EXCLUDED.auto_renews,
      updated_at = CURRENT_TIMESTAMP
    WHERE ${source.membershipProviderObservationId ?? null}::uuid IS NULL
      OR membership_source_states.membership_provider_observation_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM membership_provider_observations incoming_observation
        INNER JOIN membership_provider_observations current_observation
          ON current_observation.id = membership_source_states.membership_provider_observation_id
        WHERE incoming_observation.id = ${source.membershipProviderObservationId ?? null}::uuid
          AND (incoming_observation.provider_order, incoming_observation.provider_revision)
            > (current_observation.provider_order, current_observation.provider_revision)
      )
    RETURNING effective_at`)
  const state = rows[0] as { effective_at: Date } | undefined
  return { advanced: state !== undefined, effectiveAt: state?.effective_at ?? null }
}

export async function insertMembershipProjection(
  userId: string,
  sourceId: string,
  productId: string,
  status: MembershipStatus,
  timing: LifecycleTiming,
  cancelAtPeriodEnd: boolean,
  project: boolean,
  query: QueryExecutor,
): Promise<CreatedMembership> {
  const { rows } = await query(sql`/* createMembership */
    INSERT INTO memberships (
      user_id, membership_source_id, membership_product_id, effective_at, expires_at,
      cancelled_at, expired_at, past_due_at, paused_at, cancel_at_period_end, projection_ended_at
    ) VALUES (
      ${userId}, ${sourceId}, ${productId}, ${timing.effectiveAt}, ${timing.expiresAt},
      CASE WHEN ${status} = 'cancelled' THEN ${timing.terminalEffectiveAt}::timestamptz ELSE NULL END,
      CASE WHEN ${status} = 'expired' THEN ${timing.terminalEffectiveAt}::timestamptz ELSE NULL END,
      CASE WHEN ${status} = 'past_due' THEN ${timing.transitionEffectiveAt}::timestamptz ELSE NULL END,
      CASE WHEN ${status} = 'paused' THEN ${timing.transitionEffectiveAt}::timestamptz ELSE NULL END,
      ${isTerminalMembershipStatus(status) ? false : cancelAtPeriodEnd},
      CASE WHEN ${project} THEN NULL ELSE CURRENT_TIMESTAMP END
    )
    RETURNING id, cancelled_at, expired_at, past_due_at, paused_at, cancel_at_period_end`)
  return rows[0] as CreatedMembership
}

export async function setMembershipProjectionCancelAtPeriodEnd(
  membership: CreatedMembership,
  cancelAtPeriodEnd: boolean,
  query: QueryExecutor,
): Promise<CreatedMembership> {
  if (membership.cancel_at_period_end === cancelAtPeriodEnd) return membership
  await query(sql`/* setMembershipProjectionCancelAtPeriodEnd */
    UPDATE memberships SET cancel_at_period_end = ${cancelAtPeriodEnd}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${membership.id} AND projection_ended_at IS NULL`)
  return { ...membership, cancel_at_period_end: cancelAtPeriodEnd }
}

export type CreatedMembership = {
  id: string
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
  cancel_at_period_end: boolean
}
