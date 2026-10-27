import type { QueryExecutor } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { AppleMembershipProviderEnvironment } from './types.mts'

export type AppleVerificationContext = {
  applicationId: string
  providerContextId: string
  encryptedEvidence: Buffer
  environment: AppleMembershipProviderEnvironment
  evidenceId: string
  evidenceLookupSha256: string
  purchaseIntentId: string | null
  userId: string
  verificationId: string
}

export function decryptAppleVerificationEvidence(
  encryptedEvidence: Buffer,
  lookupSha256: string,
): { signed_transaction_info: string } {
  const plaintext = decryptSecret(
    encryptedEvidence.toString(),
    `membership-provider-evidence:apple_app_store:${lookupSha256}`,
  )
  return JSON.parse(plaintext) as { signed_transaction_info: string }
}

export async function getPendingAppleVerification(
  verificationId: string,
  query: QueryExecutor,
): Promise<AppleVerificationContext | null> {
  const { rows } = await query(sql`/* getPendingAppleVerification */
    SELECT verification.id AS "verificationId", verification.user_id AS "userId",
      verification.membership_purchase_intent_id AS "purchaseIntentId",
      verification.membership_provider_context_id AS "providerContextId",
      provider_context.environment, provider_context.application_id AS "applicationId",
      evidence.id AS "evidenceId",
      evidence.encrypted_evidence AS "encryptedEvidence", evidence.evidence_lookup_sha256 AS "evidenceLookupSha256"
    FROM membership_verifications verification
    INNER JOIN membership_provider_evidence_records evidence
      ON evidence.id = verification.membership_provider_evidence_record_id
    INNER JOIN membership_provider_contexts provider_context
      ON provider_context.id = verification.membership_provider_context_id
    WHERE verification.id = ${verificationId} AND provider_context.provider = 'apple_app_store'
      AND verification.verified_at IS NULL AND verification.conflicted_at IS NULL
      AND verification.rejected_at IS NULL
    FOR UPDATE OF verification, evidence`)
  return (rows[0] as AppleVerificationContext | undefined) ?? null
}

export async function getAppleVerificationProduct(
  context: AppleVerificationContext,
  providerProductId: string | undefined,
  query: QueryExecutor,
): Promise<
  | { membershipProductId: string; membershipProviderProductId: string; providerProductId: string }
  | undefined
> {
  const { rows } = await query(sql`/* getAppleVerificationProduct */
    SELECT mapping.id AS "membershipProviderProductId", mapping.membership_product_id AS "membershipProductId",
      mapping.provider_product_id AS "providerProductId"
    FROM membership_provider_products mapping
    WHERE mapping.membership_provider_context_id = ${context.providerContextId}
      AND mapping.provider_product_id = ${providerProductId ?? null} AND mapping.retired_at IS NULL
      AND (${context.purchaseIntentId}::UUID IS NULL OR mapping.id = (
        SELECT membership_provider_product_id FROM membership_purchase_intents
        WHERE id = ${context.purchaseIntentId}::UUID AND user_id = ${context.userId}
          AND membership_provider_context_id = ${context.providerContextId}
          AND launched_at IS NOT NULL AND failed_at IS NULL
      ))
    LIMIT 1`)
  return rows[0] as
    | {
        membershipProductId: string
        membershipProviderProductId: string
        providerProductId: string
      }
    | undefined
}

export async function getAppleVerificationPurchaseIntent(
  context: AppleVerificationContext,
  token: string | null,
  mapping: { membershipProviderProductId: string },
  query: QueryExecutor,
): Promise<boolean> {
  if (!context.purchaseIntentId || token !== context.purchaseIntentId) return false
  const { rowCount } = await query(sql`/* getAppleVerificationPurchaseIntent */
    SELECT 1 FROM membership_purchase_intents
    WHERE id = ${context.purchaseIntentId} AND user_id = ${context.userId}
      AND membership_provider_product_id = ${mapping.membershipProviderProductId}
      AND membership_provider_context_id = ${context.providerContextId}
      AND launched_at IS NOT NULL AND failed_at IS NULL`)
  return rowCount === 1
}
