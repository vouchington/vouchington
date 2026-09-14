import { createHash } from 'node:crypto'
import { type QueryExecutor } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { ProviderMembershipSourceConflictError } from '../provider-source.mts'
import type { MicrosoftStoreObservation } from './types.mts'
import type { Context, Evidence, Mapping } from './verification-persistence.mts'

export async function acceptObservation(
  context: Context,
  lineageId: string,
  mapping: Mapping,
  observation: MicrosoftStoreObservation,
  query: QueryExecutor,
): Promise<string> {
  if (context.evidenceVerifiedAt && context.evidenceLineageId !== lineageId)
    throw new ProviderMembershipSourceConflictError('Microsoft Store evidence lineage changed')
  if (!context.evidenceVerifiedAt) {
    const { rowCount } = await query(
      sql`/* acceptMicrosoftStoreVerificationEvidence */ UPDATE membership_provider_evidence_records SET membership_provider_lineage_id = ${lineageId}, verified_at = CURRENT_TIMESTAMP WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL AND (membership_provider_lineage_id IS NULL OR membership_provider_lineage_id = ${lineageId})`,
    )
    if (rowCount !== 1)
      throw new ProviderMembershipSourceConflictError(
        'Microsoft Store evidence claim was superseded',
      )
  }
  const { rows } = await query<{ id: string }>(sql`/* insertMicrosoftStoreVerificationObservation */
    INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, provider_revision, provider_order, terminal_at, source_kind, effective_at, expires_at, cancelled_at, expired_at, auto_renews)
    VALUES ('microsoft_store', ${context.environment}, ${context.applicationId}, ${context.evidenceId}, ${lineageId}, ${mapping.membershipProviderProductId}, ${mapping.membershipProductId}, ${observation.providerRevision}, ${observation.providerOrder}, ${observation.terminalAt}, 'direct', ${observation.effectiveAt}, ${observation.expiresAt}, ${observation.lifecycle === 'revoked' ? observation.terminalAt : null}, ${observation.lifecycle === 'expired' ? observation.terminalAt : null}, ${observation.autoRenews})
    ON CONFLICT (membership_provider_lineage_id, provider_revision, provider_order) DO NOTHING RETURNING id`)
  if (rows[0]) return rows[0].id
  const { rows: existing } = await query<{ id: string }>(
    sql`/* findMicrosoftStoreVerificationObservation */ SELECT id FROM membership_provider_observations WHERE membership_provider_lineage_id = ${lineageId} AND provider_revision = ${observation.providerRevision} AND provider_order = ${observation.providerOrder} FOR KEY SHARE`,
  )
  if (!existing[0]) throw new Error('Microsoft Store observation was not returned')
  return existing[0].id
}

export async function persistCredentials(
  context: Context,
  lineageId: string,
  observationId: string,
  evidence: Evidence,
  observation: MicrosoftStoreObservation,
  query: QueryExecutor,
): Promise<void> {
  const { rows: current } = await query<{
    current: boolean
  }>(sql`/* isCurrentMicrosoftStoreObservation */
    SELECT TRUE AS current FROM membership_sources source INNER JOIN membership_source_states state ON state.membership_source_id = source.id
    WHERE source.user_id = ${context.userId} AND source.membership_provider_lineage_id = ${lineageId} AND state.membership_provider_observation_id = ${observationId}::UUID`)
  const isCurrent = current[0]?.current === true
  const collectionsDigest = digest(evidence.collectionsKey)
  const purchaseDigest = digest(evidence.purchaseKey)
  const maximumCredentialExpiry = new Date(Date.now() + 30 * 86_400_000)
  const collectionsExpiresAt = earlier(evidence.collectionsExpiresAt, maximumCredentialExpiry)
  const purchaseExpiresAt = earlier(evidence.purchaseExpiresAt, maximumCredentialExpiry)
  const encryptedCollectionsKey = Buffer.from(
    encryptSecret(
      evidence.collectionsKey,
      `membership-microsoft-store-collections:${collectionsDigest}`,
    ),
  )
  const encryptedPurchaseKey = Buffer.from(
    encryptSecret(evidence.purchaseKey, `membership-microsoft-store-purchase:${purchaseDigest}`),
  )
  await query(sql`/* persistMicrosoftStoreCredentials */
    INSERT INTO membership_microsoft_store_credentials (user_id, environment, application_id, publisher_user_id, collections_key_lookup_sha256, encrypted_collections_key, collections_issued_at, collections_expires_at, purchase_key_lookup_sha256, encrypted_purchase_key, purchase_issued_at, purchase_expires_at, collection_item_id, last_verified_end_at, last_verified_at, next_reconciliation_at, processing_claim_token, processing_claimed_at, processing_attempts, last_error)
    VALUES (${context.userId}, ${context.environment}, ${context.applicationId}, ${evidence.publisherUserId}, ${collectionsDigest}, ${encryptedCollectionsKey}, ${evidence.collectionsIssuedAt}, ${collectionsExpiresAt}, ${purchaseDigest}, ${encryptedPurchaseKey}, ${evidence.purchaseIssuedAt}, ${purchaseExpiresAt}, ${observation.collectionItemId}, ${observation.expiresAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, 0, NULL)
    ON CONFLICT (user_id, environment, application_id) DO UPDATE SET
      publisher_user_id = CASE WHEN ${isCurrent} THEN EXCLUDED.publisher_user_id ELSE membership_microsoft_store_credentials.publisher_user_id END,
      collection_item_id = CASE WHEN ${isCurrent} THEN EXCLUDED.collection_item_id ELSE membership_microsoft_store_credentials.collection_item_id END,
      last_verified_end_at = CASE WHEN ${isCurrent} THEN EXCLUDED.last_verified_end_at ELSE membership_microsoft_store_credentials.last_verified_end_at END,
      last_verified_at = CASE WHEN ${isCurrent} THEN CURRENT_TIMESTAMP ELSE membership_microsoft_store_credentials.last_verified_at END,
      next_reconciliation_at = CASE WHEN ${isCurrent} THEN CURRENT_TIMESTAMP ELSE membership_microsoft_store_credentials.next_reconciliation_at END,
      processing_claim_token = CASE WHEN ${isCurrent} THEN NULL ELSE membership_microsoft_store_credentials.processing_claim_token END, processing_claimed_at = CASE WHEN ${isCurrent} THEN NULL ELSE membership_microsoft_store_credentials.processing_claimed_at END,
      processing_attempts = CASE WHEN ${isCurrent} THEN 0 ELSE membership_microsoft_store_credentials.processing_attempts END, last_error = CASE WHEN ${isCurrent} THEN NULL ELSE membership_microsoft_store_credentials.last_error END,
      collections_key_lookup_sha256 = CASE WHEN (EXCLUDED.collections_issued_at, EXCLUDED.collections_expires_at, EXCLUDED.collections_key_lookup_sha256) > (membership_microsoft_store_credentials.collections_issued_at, membership_microsoft_store_credentials.collections_expires_at, membership_microsoft_store_credentials.collections_key_lookup_sha256) THEN EXCLUDED.collections_key_lookup_sha256 ELSE membership_microsoft_store_credentials.collections_key_lookup_sha256 END,
      encrypted_collections_key = CASE WHEN (EXCLUDED.collections_issued_at, EXCLUDED.collections_expires_at, EXCLUDED.collections_key_lookup_sha256) > (membership_microsoft_store_credentials.collections_issued_at, membership_microsoft_store_credentials.collections_expires_at, membership_microsoft_store_credentials.collections_key_lookup_sha256) THEN EXCLUDED.encrypted_collections_key ELSE membership_microsoft_store_credentials.encrypted_collections_key END,
      collections_issued_at = GREATEST(membership_microsoft_store_credentials.collections_issued_at, EXCLUDED.collections_issued_at),
      collections_expires_at = CASE WHEN (EXCLUDED.collections_issued_at, EXCLUDED.collections_expires_at, EXCLUDED.collections_key_lookup_sha256) > (membership_microsoft_store_credentials.collections_issued_at, membership_microsoft_store_credentials.collections_expires_at, membership_microsoft_store_credentials.collections_key_lookup_sha256) THEN EXCLUDED.collections_expires_at ELSE membership_microsoft_store_credentials.collections_expires_at END,
      purchase_key_lookup_sha256 = CASE WHEN (EXCLUDED.purchase_issued_at, EXCLUDED.purchase_expires_at, EXCLUDED.purchase_key_lookup_sha256) > (membership_microsoft_store_credentials.purchase_issued_at, membership_microsoft_store_credentials.purchase_expires_at, membership_microsoft_store_credentials.purchase_key_lookup_sha256) THEN EXCLUDED.purchase_key_lookup_sha256 ELSE membership_microsoft_store_credentials.purchase_key_lookup_sha256 END,
      encrypted_purchase_key = CASE WHEN (EXCLUDED.purchase_issued_at, EXCLUDED.purchase_expires_at, EXCLUDED.purchase_key_lookup_sha256) > (membership_microsoft_store_credentials.purchase_issued_at, membership_microsoft_store_credentials.purchase_expires_at, membership_microsoft_store_credentials.purchase_key_lookup_sha256) THEN EXCLUDED.encrypted_purchase_key ELSE membership_microsoft_store_credentials.encrypted_purchase_key END,
      purchase_issued_at = GREATEST(membership_microsoft_store_credentials.purchase_issued_at, EXCLUDED.purchase_issued_at),
      purchase_expires_at = CASE WHEN (EXCLUDED.purchase_issued_at, EXCLUDED.purchase_expires_at, EXCLUDED.purchase_key_lookup_sha256) > (membership_microsoft_store_credentials.purchase_issued_at, membership_microsoft_store_credentials.purchase_expires_at, membership_microsoft_store_credentials.purchase_key_lookup_sha256) THEN EXCLUDED.purchase_expires_at ELSE membership_microsoft_store_credentials.purchase_expires_at END`)
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
function earlier(first: Date, second: Date): Date {
  return first <= second ? first : second
}
