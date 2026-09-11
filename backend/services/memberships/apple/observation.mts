import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AppleMembershipObservation } from './types.mts'

export async function acceptAndInsertAppleObservation(
  query: QueryExecutor,
  context: {
    applicationId: string
    environment: 'test' | 'production'
    lineageId: string
  },
  mapping: {
    membershipProviderProductId: string
    membershipProductId: string
  },
  evidenceId: string,
  observation: AppleMembershipObservation,
  providerOrder: number,
): Promise<string | null> {
  const { rowCount } = await query(sql`/* acceptAppleNotificationEvidence */
    UPDATE membership_provider_evidence_records SET verified_at = CURRENT_TIMESTAMP
    WHERE id = ${evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`)
  if (rowCount !== 1) return null
  const { rows } = await query(sql`/* insertAppleMembershipObservation */
    INSERT INTO membership_provider_observations (
      provider, environment, application_id, membership_provider_evidence_id,
      membership_provider_lineage_id, membership_provider_product_id, membership_product_id,
      provider_revision, provider_order, terminal_at, source_kind, effective_at, expires_at,
      cancelled_at, expired_at, auto_renews
    ) VALUES (
      'apple_app_store', ${context.environment}, ${context.applicationId}, ${evidenceId},
      ${context.lineageId}, ${mapping.membershipProviderProductId}, ${mapping.membershipProductId},
      ${observation.providerRevision}, ${providerOrder}, ${observation.terminalAt},
      ${observation.sourceKind}, ${observation.effectiveAt}, ${observation.expiresAt},
      ${observation.lifecycle === 'revoked' ? observation.terminalAt : null},
      ${observation.lifecycle === 'expired' ? observation.terminalAt : null}, false
    ) ON CONFLICT (membership_provider_lineage_id, provider_revision, provider_order)
      DO NOTHING
    RETURNING id`)
  if (rows[0]) return (rows[0] as { id: string }).id
  const { rows: existingRows } = await query(sql`/* getAppleMembershipObservation */
    SELECT id FROM membership_provider_observations
    WHERE membership_provider_lineage_id = ${context.lineageId}
      AND provider_revision = ${observation.providerRevision}
      AND provider_order = ${providerOrder}
      AND source_kind = ${observation.sourceKind}
      AND membership_product_id = ${mapping.membershipProductId}
    FOR KEY SHARE`)
  return (existingRows[0] as { id: string } | undefined)?.id ?? null
}
