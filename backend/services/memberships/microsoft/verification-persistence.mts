import type { QueryExecutor } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { ProviderMembershipSourceConflictError } from '../provider-source.mts'
import { getOrCreateProviderContextId } from '../provider-context.mts'
import { validateMicrosoftStoreIdKeyClaims } from './store-id-key-claims.mts'
import type { MicrosoftStoreObservation } from './types.mts'

export type Context = {
  verificationId: string
  providerContextId: string
  userId: string
  purchaseIntentId: string | null
  evidenceId: string
  encryptedEvidence: Buffer
  evidenceLookupSha256: string
  evidenceRejectedAt: Date | null
  evidenceRejectionReason:
    | import('../verification-contract.mts').MembershipVerificationReasonCode
    | null
  evidenceVerifiedAt: Date | null
  evidenceLineageId: string | null
  environment: 'test' | 'production'
  applicationId: string
}
export type Evidence = {
  collectionsKey: string
  purchaseKey: string
  publisherUserId: string
  productId: string
  skuId: string | null
  collectionsIssuedAt: Date
  collectionsExpiresAt: Date
  purchaseIssuedAt: Date
  purchaseExpiresAt: Date
  recoverySkuId: string | null
  recoveryRecurrenceId: string | null
}
export type Mapping = {
  membershipProductId: string
  membershipProviderProductId: string
  providerProductId: string
  skuId: string | null
}

export async function getContext(id: string, query: QueryExecutor): Promise<Context | null> {
  const { rows } = await query<Context>(sql`/* getPendingMicrosoftStoreVerification */
    SELECT verification.id AS "verificationId", verification.user_id AS "userId", verification.membership_purchase_intent_id AS "purchaseIntentId", provider_context.id AS "providerContextId", provider_context.environment, provider_context.application_id AS "applicationId", evidence.id AS "evidenceId", evidence.encrypted_evidence AS "encryptedEvidence", evidence.evidence_lookup_sha256 AS "evidenceLookupSha256", evidence.rejected_at AS "evidenceRejectedAt", evidence.rejection_reason AS "evidenceRejectionReason", evidence.verified_at AS "evidenceVerifiedAt", evidence.membership_provider_lineage_id AS "evidenceLineageId"
    FROM membership_verifications verification
    INNER JOIN membership_provider_contexts provider_context ON provider_context.id = verification.membership_provider_context_id
    INNER JOIN membership_provider_evidence_records evidence ON evidence.id = verification.membership_provider_evidence_record_id
    WHERE verification.id = ${id} AND provider_context.provider = 'microsoft_store' AND verification.verified_at IS NULL AND verification.conflicted_at IS NULL AND verification.rejected_at IS NULL
    FOR UPDATE OF verification, evidence`)
  return rows[0] ?? null
}

export function decryptEvidence(context: Context): Evidence | null {
  const clientId = process.env.MICROSOFT_STORE_CLIENT_ID
  if (!clientId) throw new Error('MICROSOFT_STORE_CLIENT_ID is required')
  const plaintext = decryptSecret(
    context.encryptedEvidence.toString(),
    `membership-provider-evidence:microsoft_store:${context.evidenceLookupSha256}`,
  )
  try {
    const raw = JSON.parse(plaintext) as Record<string, unknown>
    const collectionsKey = string(raw.collections_store_id_key ?? raw.collectionsStoreIdKey)
    const purchaseKey = string(raw.purchase_store_id_key ?? raw.purchaseStoreIdKey)
    const publisherUserId = string(raw.publisher_user_id ?? raw.publisherUserId)
    const productId = string(raw.product_id ?? raw.productId)
    const skuId = nullableString(raw.sku_id ?? raw.skuId)
    const recoveryRecurrenceId = nullableString(
      raw.recovery_recurrence_id ?? raw.recoveryRecurrenceId,
    )
    const recoverySkuId = nullableString(raw.recovery_sku_id ?? raw.recoverySkuId)
    const collectionsClaims = collectionsKey
      ? validateMicrosoftStoreIdKeyClaims({
          key: collectionsKey,
          kind: 'collections',
          clientId,
          userId: context.userId,
        })
      : null
    const purchaseClaims = purchaseKey
      ? validateMicrosoftStoreIdKeyClaims({
          key: purchaseKey,
          kind: 'purchase',
          clientId,
          userId: context.userId,
        })
      : null
    return collectionsKey &&
      purchaseKey &&
      publisherUserId &&
      productId &&
      collectionsClaims &&
      purchaseClaims
      ? {
          collectionsKey,
          purchaseKey,
          publisherUserId,
          productId,
          skuId,
          collectionsIssuedAt: collectionsClaims.issuedAt,
          collectionsExpiresAt: collectionsClaims.expiresAt,
          purchaseIssuedAt: purchaseClaims.issuedAt,
          purchaseExpiresAt: purchaseClaims.expiresAt,
          recoverySkuId,
          recoveryRecurrenceId,
        }
      : null
  } catch {
    return null
  }
}

export async function getMapping(
  context: Context,
  evidence: Evidence,
  query: QueryExecutor,
): Promise<Mapping | null> {
  const { rows } = await query<Mapping>(sql`/* getMicrosoftStoreVerificationMapping */
    SELECT mapping.id AS "membershipProviderProductId", mapping.membership_product_id AS "membershipProductId", mapping.provider_product_id AS "providerProductId", mapping.sku_id AS "skuId"
    FROM membership_provider_products mapping
    INNER JOIN membership_provider_contexts provider_context
      ON provider_context.id = mapping.membership_provider_context_id
    WHERE provider_context.provider = 'microsoft_store'
      AND provider_context.environment = ${context.environment}
      AND provider_context.application_id = ${context.applicationId}
      AND mapping.provider_product_id = ${evidence.productId}
      AND mapping.sku_id IS NOT DISTINCT FROM ${evidence.skuId}
      AND (${context.purchaseIntentId}::UUID IS NULL OR mapping.id = (
        SELECT intent.membership_provider_product_id FROM membership_purchase_intents intent
        WHERE intent.id = ${context.purchaseIntentId}::UUID AND intent.user_id = ${context.userId}
          AND intent.membership_provider_context_id = mapping.membership_provider_context_id
      ))`)
  return rows[0] ?? null
}

export async function persistLineage(
  context: Context,
  observation: MicrosoftStoreObservation,
  query: QueryExecutor,
): Promise<string> {
  const contextId = await getOrCreateProviderContextId(
    {
      provider: 'microsoft_store',
      environment: context.environment,
      applicationId: context.applicationId,
    },
    query,
  )
  const { rows } = await query<{ id: string }>(sql`/* persistMicrosoftStoreLineage */
    INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id, provider_account_id)
    VALUES (${contextId}, ${observation.providerLineageId}, ${observation.providerAccountId})
    ON CONFLICT (membership_provider_context_id, provider_lineage_id) DO NOTHING
    RETURNING id`)
  if (rows[0]) return rows[0].id
  const { rows: existing } = await query<{
    id: string
    providerAccountId: string | null
  }>(sql`/* findMicrosoftStoreLineage */
    SELECT id, provider_account_id AS "providerAccountId" FROM membership_provider_lineages
    WHERE membership_provider_context_id = ${contextId}
      AND provider_lineage_id = ${observation.providerLineageId}
    FOR UPDATE`)
  if (!existing[0] || existing[0].providerAccountId !== observation.providerAccountId)
    throw new ProviderMembershipSourceConflictError('Microsoft Store lineage account changed')
  return existing[0].id
}

export function expired(evidence: Evidence): boolean {
  return evidence.collectionsExpiresAt <= new Date() || evidence.purchaseExpiresAt <= new Date()
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value)
}
