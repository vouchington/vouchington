import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { GooglePlayLineageConflictError } from './lineage.mts'
import {
  matchesDeferredGooglePlayReplacement,
  matchesExpectedGooglePlayProduct,
  verifyGooglePlaySubscription,
} from './subscription-verifier.mts'
import type { GooglePlayMembershipObservation } from './types.mts'
import type { Context } from './process-verification.mts'

export async function allocateGooglePlayObservationOrder(): Promise<number> {
  const { rows } = await write<{ provider_order: string }>(
    sql`/* allocateGooglePlayObservationOrder */ SELECT nextval('membership_google_play_observation_order_seq') AS provider_order`,
  )
  const value = Number(rows[0]?.provider_order)
  if (!Number.isSafeInteger(value)) throw new Error('Google Play observation order exhausted')
  return value
}
export async function terminalizeGooglePlayConflict(
  id: string,
  token: string,
  reason: 'wrong_account' | 'competing_direct_source',
): Promise<void> {
  await write(
    sql`/* terminalizeGooglePlayConflict */ UPDATE membership_verifications SET conflicted_at = CURRENT_TIMESTAMP, result_code = ${reason}, processing_claim_token = NULL, processing_claimed_at = NULL, next_processing_at = NULL, last_error = NULL WHERE id = ${id} AND processing_claim_token = ${token} AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`,
  )
}

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
    FROM membership_verifications verification INNER JOIN membership_provider_evidence_records evidence ON evidence.id = verification.membership_provider_evidence_id
    WHERE verification.id = ${id} AND verification.provider = 'google_play' AND verification.processing_claim_token = ${token}
      AND verification.verified_at IS NULL AND verification.conflicted_at IS NULL AND verification.rejected_at IS NULL
    FOR UPDATE OF verification, evidence`)
  return rows[0] ?? null
}
export function getPurchaseToken(context: Context): string | null {
  const plaintext = decryptSecret(
    context.encryptedEvidence.toString(),
    `membership-provider-evidence:google_play:${context.evidenceLookupSha256}`,
  )
  try {
    const value = JSON.parse(plaintext) as { purchase_token?: unknown }
    return typeof value.purchase_token === 'string' && value.purchase_token.trim()
      ? value.purchase_token
      : null
  } catch {
    return null
  }
}
export async function getMapping(
  context: Context,
  subscription: Parameters<typeof verifyGooglePlaySubscription>[0]['subscription'],
  query: QueryExecutor,
): Promise<{
  membershipProductId: string
  membershipProviderProductId: string
  providerProductId: string
  basePlanId: string | null
  offerId: string | null
} | null> {
  const { rows } = await query<{
    membershipProductId: string
    membershipProviderProductId: string
    providerProductId: string
    basePlanId: string | null
    offerId: string | null
  }>(sql`/* getGooglePlayVerificationMapping */
    SELECT mapping.id AS "membershipProviderProductId", mapping.membership_product_id AS "membershipProductId", mapping.provider_product_id AS "providerProductId", mapping.base_plan_id AS "basePlanId", mapping.offer_id AS "offerId"
    FROM membership_provider_products mapping WHERE mapping.provider = 'google_play' AND mapping.environment = ${context.environment}
      AND mapping.application_id = ${context.applicationId}
      AND (${context.purchaseIntentId}::UUID IS NULL OR mapping.id = (SELECT membership_provider_product_id FROM membership_purchase_intents WHERE id = ${context.purchaseIntentId}::UUID AND user_id = ${context.userId} AND provider = 'google_play'))`)
  const exact = rows.find(row =>
    subscription.lineItems?.some(item => matchesExpectedGooglePlayProduct(item, row)),
  )
  if (exact) return exact
  const deferred = rows.filter(row =>
    subscription.lineItems?.some(item => matchesDeferredGooglePlayReplacement(item, row)),
  )
  // Deferred replacement identifies a product, not a base plan or offer. A purchase intent pins
  // the target mapping; without one, do not select an arbitrary mapping for a shared product.
  return deferred.length === 1 ? deferred[0]! : null
}
export async function acceptObservation(
  context: Context,
  lineageId: string,
  mapping: { membershipProductId: string; membershipProviderProductId: string },
  observation: GooglePlayMembershipObservation,
  query: QueryExecutor,
): Promise<string> {
  if (context.evidenceVerifiedAt) {
    if (context.evidenceLineageId !== lineageId) throw new GooglePlayLineageConflictError()
    const { rows: existingEvidenceObservation } = await query<{
      id: string
      membership_provider_product_id: string
    }>(sql`
      /* findGooglePlayObservationForVerifiedEvidence */
      SELECT id, membership_provider_product_id FROM membership_provider_observations
      WHERE membership_provider_evidence_id = ${context.evidenceId} AND provider = 'google_play'
        AND membership_provider_lineage_id = ${lineageId} FOR KEY SHARE`)
    const existingObservation = existingEvidenceObservation[0]
    if (existingObservation) {
      if (
        existingObservation.membership_provider_product_id !== mapping.membershipProviderProductId
      )
        throw new GooglePlayLineageConflictError()
      return existingObservation.id
    }
  } else {
    const { rowCount } = await query(
      sql`/* acceptGooglePlayVerificationEvidence */ UPDATE membership_provider_evidence_records
        SET membership_provider_lineage_id = ${lineageId}, verified_at = CURRENT_TIMESTAMP
        WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL
          AND (membership_provider_lineage_id IS NULL OR membership_provider_lineage_id = ${lineageId})`,
    )
    if (rowCount !== 1) throw new GooglePlayLineageConflictError()
  }
  const { rows: matching } = await query<{ id: string }>(sql`/* findMatchingGooglePlayObservation */
    SELECT id FROM (
      SELECT * FROM membership_provider_observations
      WHERE membership_provider_lineage_id = ${lineageId} AND provider = 'google_play'
      ORDER BY provider_order DESC LIMIT 1
    ) latest
    WHERE membership_provider_product_id = ${mapping.membershipProviderProductId}
      AND provider_revision = ${observation.providerRevision}
      AND expires_at IS NOT DISTINCT FROM ${observation.expiresAt}
      AND terminal_at IS NOT DISTINCT FROM ${observation.terminalAt}
      AND cancelled_at IS NOT DISTINCT FROM ${observation.lifecycle === 'revoked' ? observation.terminalAt : null}
      AND expired_at IS NOT DISTINCT FROM ${observation.lifecycle === 'expired' ? observation.terminalAt : null}
      AND paused_at IS NOT DISTINCT FROM ${observation.lifecycle === 'paused' ? (observation.terminalAt ?? observation.effectiveAt) : null}
      AND auto_renews = ${observation.autoRenews}
    `)
  if (matching[0]) return matching[0].id
  const initialEffectiveAt = observation.effectiveAt
    ? null
    : (
        await query<{ effective_at: Date }>(sql`/* findGooglePlayInitialEffectiveAt */
          SELECT effective_at FROM membership_provider_observations
          WHERE membership_provider_lineage_id = ${lineageId} AND provider = 'google_play'
          ORDER BY effective_at ASC LIMIT 1`)
      ).rows[0]?.effective_at
  const effectiveAt =
    observation.effectiveAt ??
    new Date(Math.min(initialEffectiveAt?.getTime() ?? Date.now(), observation.expiresAt.getTime()))
  const { rows } = await query<{ id: string }>(
    sql`/* insertGooglePlayVerificationObservation */ INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, provider_revision, provider_order, terminal_at, source_kind, effective_at, expires_at, cancelled_at, expired_at, paused_at, auto_renews) VALUES ('google_play', ${context.environment}, ${context.applicationId}, ${context.evidenceId}, ${lineageId}, ${mapping.membershipProviderProductId}, ${mapping.membershipProductId}, ${observation.providerRevision}, ${observation.providerOrder}, ${observation.terminalAt}, 'direct', ${effectiveAt}, ${observation.expiresAt}, ${observation.lifecycle === 'revoked' ? observation.terminalAt : null}, ${observation.lifecycle === 'expired' ? observation.terminalAt : null}, ${observation.lifecycle === 'paused' ? (observation.terminalAt ?? effectiveAt) : null}, ${observation.autoRenews}) ON CONFLICT (membership_provider_lineage_id, provider_revision, provider_order) DO NOTHING RETURNING id`,
  )
  if (rows[0]) return rows[0].id
  const { rows: existing } = await query<{ id: string }>(
    sql`/* insertGooglePlayVerificationObservation.existing */ SELECT id FROM membership_provider_observations WHERE membership_provider_lineage_id = ${lineageId} AND provider_revision = ${observation.providerRevision} AND provider_order = ${observation.providerOrder} FOR KEY SHARE`,
  )
  if (!existing[0]) throw new Error('Google Play observation was not returned')
  return existing[0].id
}
export async function finalizeVerified(
  context: Context,
  token: string,
  query: QueryExecutor,
): Promise<void> {
  const { rowCount } = await query(
    sql`/* finalizeGooglePlayVerification */ UPDATE membership_verifications SET verified_at = CURRENT_TIMESTAMP, result_code = 'verified', processing_claim_token = NULL, processing_claimed_at = NULL, next_processing_at = NULL, last_error = NULL WHERE id = ${context.verificationId} AND processing_claim_token = ${token} AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`,
  )
  if (rowCount !== 1) throw new Error('Google Play verification claim was superseded')
}
export async function reject(
  context: Context,
  token: string,
  reason: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  if (reason !== 'wrong_account')
    await query(
      sql`/* rejectGooglePlayVerification */ UPDATE membership_provider_evidence_records SET rejected_at = CURRENT_TIMESTAMP, rejection_reason = ${reason} WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`,
    )
  await query(
    sql`/* finalizeRejectedGooglePlayVerification */ UPDATE membership_verifications SET rejected_at = CURRENT_TIMESTAMP, result_code = ${reason}, processing_claim_token = NULL, processing_claimed_at = NULL, next_processing_at = NULL, last_error = NULL WHERE id = ${context.verificationId} AND processing_claim_token = ${token} AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`,
  )
  await query.commit()
}
export async function deferGooglePlayVerification(
  id: string,
  token: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : 'Google Play verification retry'
  await write(
    sql`/* deferGooglePlayVerification */ UPDATE membership_verifications SET processing_claim_token = NULL, processing_claimed_at = NULL, next_processing_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes', last_error = ${message.slice(0, 1000)} WHERE id = ${id} AND processing_claim_token = ${token} AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`,
  )
}
