import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { Context } from './process-verification-types.mts'

export async function getContext(
  id: string,
  token: string,
  query: QueryExecutor,
): Promise<Context | null> {
  const { rows } = await query<Context>(sql`/* getClaimedGooglePlayVerification */
    SELECT verification.id AS "verificationId", verification.user_id AS "userId", verification.membership_purchase_intent_id AS "purchaseIntentId",
      verification.environment, verification.application_id AS "applicationId", evidence.id AS "evidenceId", evidence.encrypted_evidence AS "encryptedEvidence", evidence.evidence_lookup_sha256 AS "evidenceLookupSha256",
      evidence.rejected_at AS "evidenceRejectedAt", evidence.rejection_reason AS "evidenceRejectionReason",
      evidence.verified_at AS "evidenceVerifiedAt", evidence.membership_provider_lineage_id AS "evidenceLineageId"
    FROM membership_verifications verification
    INNER JOIN membership_verification_processing_work_items work ON work.membership_verification_id = verification.id INNER JOIN membership_provider_evidence_records evidence ON evidence.id = verification.membership_provider_evidence_record_id
    WHERE verification.id = ${id} AND verification.provider = 'google_play' AND work.lease_token = ${token} AND work.lease_expires_at > clock_timestamp()
      AND verification.verified_at IS NULL AND verification.conflicted_at IS NULL AND verification.rejected_at IS NULL
    FOR UPDATE OF verification, evidence, work`)
  return rows[0] ?? null
}
