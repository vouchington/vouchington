import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AppleMembershipObservation } from './types.mts'
import type { AppleVerificationContext } from './process-verification-context.mts'

export class AppleVerificationConflictError extends Error {
  readonly reasonCode: 'competing_direct_source' | 'wrong_account'

  constructor(reasonCode: 'competing_direct_source' | 'wrong_account') {
    super(reasonCode)
    this.reasonCode = reasonCode
    this.name = 'AppleVerificationConflictError'
  }
}

export async function finalizeAppleVerificationFromPriorAttempt(
  context: AppleVerificationContext,
  processingClaimToken: string,
  query: QueryExecutor,
): Promise<boolean> {
  const { rows } = await query(sql`/* findPriorAppleVerificationAttempt */
    SELECT user_id, verified_at, conflicted_at, rejected_at, result_code
    FROM membership_verifications
    WHERE membership_provider_evidence_id = ${context.evidenceId}
      AND id <> ${context.verificationId}
      AND (verified_at IS NOT NULL OR conflicted_at IS NOT NULL OR rejected_at IS NOT NULL)
    ORDER BY
      (user_id = ${context.userId} AND verified_at IS NOT NULL) DESC,
      (verified_at IS NOT NULL) DESC,
      created_at ASC
    LIMIT 1
    FOR KEY SHARE`)
  const prior = rows[0] as
    | {
        user_id: string
        verified_at: Date | null
        conflicted_at: Date | null
        rejected_at: Date | null
        result_code: string | null
      }
    | undefined
  if (!prior) return false

  if (prior.verified_at) {
    const sameUser = prior.user_id === context.userId
    await finalizeAppleVerification(
      context,
      processingClaimToken,
      sameUser ? 'verified' : 'conflict',
      sameUser ? 'verified' : 'wrong_account',
      query,
    )
    return true
  }
  const disposition = prior.rejected_at ? 'rejected' : 'conflict'
  await finalizeAppleVerification(
    context,
    processingClaimToken,
    disposition,
    prior.result_code ?? (disposition === 'rejected' ? 'invalid_evidence' : 'wrong_account'),
    query,
  )
  return true
}

export async function createAppleVerificationLineage(
  context: AppleVerificationContext,
  observation: AppleMembershipObservation,
  query: QueryExecutor,
): Promise<string> {
  const { rows } = await query(sql`/* createAppleVerificationLineage */
    INSERT INTO membership_provider_lineages (
      provider, environment, application_id, provider_lineage_id, provider_account_id
    ) VALUES (
      'apple_app_store', ${context.environment}, ${context.applicationId},
      ${observation.providerLineageId}, ${observation.appAccountToken}
    ) ON CONFLICT (provider, environment, application_id, provider_lineage_id) DO NOTHING
    RETURNING id`)
  if (rows[0]) return (rows[0] as { id: string }).id
  const { rows: existingRows } = await query(sql`/* lockAppleVerificationLineage */
    SELECT id, provider_account_id FROM membership_provider_lineages
    WHERE provider = 'apple_app_store' AND environment = ${context.environment}
      AND application_id = ${context.applicationId} AND provider_lineage_id = ${observation.providerLineageId}
    FOR UPDATE`)
  const existing = existingRows[0] as { id: string; provider_account_id: string | null } | undefined
  if (!existing) throw new AppleVerificationConflictError('wrong_account')
  if (observation.sourceKind === 'family') return existing.id
  if (existing.provider_account_id === null) {
    const { rowCount } = await query(sql`/* bindAppleVerificationLineageAccount */
      UPDATE membership_provider_lineages
      SET provider_account_id = ${observation.appAccountToken}
      WHERE id = ${existing.id} AND provider_account_id IS NULL`)
    if (rowCount !== 1) throw new AppleVerificationConflictError('wrong_account')
    return existing.id
  }
  if (existing.provider_account_id !== observation.appAccountToken)
    throw new AppleVerificationConflictError('wrong_account')
  return existing.id
}

export async function acceptAppleVerificationObservation(
  context: AppleVerificationContext,
  lineageId: string,
  mapping: { membershipProductId: string; membershipProviderProductId: string },
  observation: AppleMembershipObservation,
  query: QueryExecutor,
): Promise<string> {
  const { rowCount } = await query(sql`/* acceptAppleVerificationEvidence */
    UPDATE membership_provider_evidence_records
    SET membership_provider_lineage_id = ${lineageId}, verified_at = CURRENT_TIMESTAMP
    WHERE id = ${context.evidenceId} AND membership_provider_lineage_id IS NULL
      AND verified_at IS NULL AND rejected_at IS NULL`)
  if (rowCount !== 1) throw new Error('Apple verification evidence was already finalized')
  const { rows } = await query(sql`/* insertAppleVerificationObservation */
    INSERT INTO membership_provider_observations (
      provider, environment, application_id, membership_provider_evidence_id,
      membership_provider_lineage_id, membership_provider_product_id, membership_product_id,
      provider_revision, provider_order, terminal_at, source_kind, effective_at, expires_at,
      cancelled_at, expired_at, auto_renews
    ) VALUES (
      'apple_app_store', ${context.environment}, ${context.applicationId}, ${context.evidenceId},
      ${lineageId}, ${mapping.membershipProviderProductId}, ${mapping.membershipProductId},
      ${observation.providerRevision}, 0, ${observation.terminalAt}, ${observation.sourceKind},
      ${observation.effectiveAt}, ${observation.expiresAt},
      ${observation.lifecycle === 'revoked' ? observation.terminalAt : null},
      ${observation.lifecycle === 'expired' ? observation.terminalAt : null}, false
    ) RETURNING id`)
  const observationId = (rows[0] as { id: string } | undefined)?.id
  if (!observationId) throw new Error('Apple verification observation was not returned')
  return observationId
}

export async function finalizeAppleVerification(
  context: AppleVerificationContext,
  processingClaimToken: string,
  disposition: 'verified' | 'conflict' | 'rejected',
  reasonCode: string,
  query: QueryExecutor,
): Promise<void> {
  const { rowCount } =
    disposition === 'verified'
      ? await query(sql`/* finalizeAppleVerification.verified */
          UPDATE membership_verifications SET verified_at = CURRENT_TIMESTAMP,
            result_code = ${reasonCode}, processing_claim_token = NULL, processing_claimed_at = NULL,
            next_processing_at = NULL, last_error = NULL
          WHERE id = ${context.verificationId} AND processing_claim_token = ${processingClaimToken}
            AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`)
      : disposition === 'conflict'
        ? await query(sql`/* finalizeAppleVerification.conflict */
            UPDATE membership_verifications SET conflicted_at = CURRENT_TIMESTAMP,
              result_code = ${reasonCode}, processing_claim_token = NULL, processing_claimed_at = NULL,
              next_processing_at = NULL, last_error = NULL
            WHERE id = ${context.verificationId} AND processing_claim_token = ${processingClaimToken}
              AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`)
        : await query(sql`/* finalizeAppleVerification.rejected */
            UPDATE membership_verifications SET rejected_at = CURRENT_TIMESTAMP,
              result_code = ${reasonCode}, processing_claim_token = NULL, processing_claimed_at = NULL,
              next_processing_at = NULL, last_error = NULL
            WHERE id = ${context.verificationId} AND processing_claim_token = ${processingClaimToken}
              AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`)
  if (rowCount !== 1) throw new Error('Apple verification claim was superseded')
}
