import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipFact } from './context.mts'
import type { AuthoritativeStripeMembershipSnapshot } from './snapshot.mts'

export async function insertStripeMembershipObservation(
  evidenceId: string,
  eventId: string,
  fact: MembershipFact,
  snapshot: AuthoritativeStripeMembershipSnapshot,
  observedAt: Date,
  query: QueryExecutor,
): Promise<string | null> {
  const observationOrder = observedAt.getTime()
  const { rows } = await query(sql`/* insertStripeMembershipObservation */
    WITH current_observation AS (
      SELECT observation.provider_order, evidence.received_at,
        observation.terminal_at IS NOT NULL AS terminal,
        evidence.rejected_at IS NOT NULL AS rejected
      FROM membership_source_states source_state
      LEFT JOIN membership_provider_observations observation
        ON observation.id = source_state.membership_provider_observation_id
      LEFT JOIN membership_provider_evidence_records evidence
        ON evidence.id = observation.membership_provider_evidence_id
      WHERE source_state.membership_source_id = ${fact.membership_source_id}
      FOR UPDATE OF source_state
    ), inserted AS (
      INSERT INTO membership_provider_observations (
        provider, environment, application_id, membership_provider_evidence_id,
        membership_provider_lineage_id, membership_provider_product_id, membership_product_id,
        observed_price_minor_units, observed_price_currency_code,
        renewal_membership_provider_product_id, renewal_membership_product_id,
        renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at,
        provider_revision, provider_order, terminal_at, source_kind, effective_at, expires_at, cancelled_at,
        expired_at, past_due_at, paused_at, auto_renews
      ) SELECT 'stripe', ${fact.livemode ? 'production' : 'test'}, ${fact.application_id}, ${evidenceId},
        ${fact.membership_provider_lineage_id}, ${snapshot.membershipProviderProductId}, ${snapshot.membershipProductId},
        ${snapshot.observedPriceMinorUnits}, ${snapshot.observedPriceCurrencyCode},
        ${snapshot.renewal?.id ?? null}, ${snapshot.renewal?.membership_product_id ?? null},
        ${snapshot.renewal?.price.unit_amount ?? null}, ${snapshot.renewal?.price.currency ?? null},
        ${snapshot.renewal?.effectiveAt ?? null}, ${eventId},
        CASE WHEN ${snapshot.terminal} AND current_observation.provider_order IS NOT NULL
          THEN GREATEST(${observationOrder}, current_observation.provider_order + 1)
          ELSE ${observationOrder} END,
        ${snapshot.terminal ? (snapshot.cancelledAt ?? snapshot.expiredAt ?? fact.received_at) : null},
        'direct',
        ${snapshot.effectiveAt}, ${snapshot.expiresAt}, ${snapshot.cancelledAt},
        ${snapshot.expiredAt}, ${snapshot.pastDueAt}, ${snapshot.pausedAt}, ${snapshot.autoRenews}
      FROM current_observation
      WHERE NOT EXISTS (
        SELECT 1 FROM current_observation
        WHERE NOT ${snapshot.terminal}
          AND (terminal OR rejected OR provider_order > ${observationOrder}
            OR (provider_order = ${observationOrder} AND received_at > ${fact.received_at}))
      )
      ON CONFLICT (membership_provider_evidence_id) DO NOTHING
      RETURNING id
    ) SELECT id FROM inserted
  `)
  const observation = rows[0] as { id: string } | undefined
  if (!observation) return null
  await query(sql`/* linkStripeMembershipSourceObservation */
    UPDATE membership_source_states SET membership_provider_observation_id = ${observation.id},
      membership_product_id = ${snapshot.membershipProductId}, effective_at = ${snapshot.effectiveAt},
      expires_at = ${snapshot.expiresAt}, cancelled_at = ${snapshot.cancelledAt},
      expired_at = ${snapshot.expiredAt}, past_due_at = ${snapshot.pastDueAt},
      paused_at = ${snapshot.pausedAt}, auto_renews = ${snapshot.autoRenews}, updated_at = CURRENT_TIMESTAMP
    WHERE membership_source_id = ${fact.membership_source_id}
  `)
  return observation.id
}
