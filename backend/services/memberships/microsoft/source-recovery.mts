import { createHash } from 'node:crypto'
import { beginTransaction, type QueryExecutor, write } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import {
  createMembershipVerificationInTransaction,
  createMembershipVerificationFingerprint,
} from '../verifications.mts'
import { createConfiguredMicrosoftStoreClient } from './configured-client.mts'
import { processMicrosoftStoreMembershipVerification } from './process-verification.mts'
import { recoveryLineageIdentity } from './recovery-recurrence.mts'
import type { MicrosoftStoreSourceRecoveryContext } from './source-recovery-context.mts'
import type { MicrosoftStoreClient } from './types.mts'

const RECOVERY_CURSOR_ID = 'active_sources'
const RECOVERY_BATCH_SIZE = 500
const SWEEP_BUCKET_MS = 60 * 60 * 1000
export type MicrosoftStoreSourceRecoveryBatch = {
  sourceIds: string[]
  previousCursor: string | null
  previousUpperBound: string | null
  sweepUpperBound: string | null
  nextCursor: string | null
  completesSweep: boolean
}

export async function findRecoverableMicrosoftStoreSourceJobs(): Promise<MicrosoftStoreSourceRecoveryBatch> {
  const cursor = await findRecoveryCursor()
  const sweepUpperBound = cursor.previousUpperBound ?? (await findSourceSweepUpperBound())
  const sourceIds = await findSourcesAfterCursor(cursor.previousCursor, sweepUpperBound)
  const page = sourceIds.slice(0, RECOVERY_BATCH_SIZE)
  return {
    ...cursor,
    sourceIds: page,
    sweepUpperBound,
    nextCursor: page.at(-1) ?? null,
    completesSweep: sourceIds.length <= RECOVERY_BATCH_SIZE,
  }
}
export async function advanceMicrosoftStoreSourceRecoveryCursor(
  batch: MicrosoftStoreSourceRecoveryBatch,
): Promise<boolean> {
  if (!batch.sweepUpperBound) return false
  const lastSourceId = batch.completesSweep ? null : batch.nextCursor
  const upperBound = batch.completesSweep ? null : batch.sweepUpperBound
  const { rowCount } = await write(
    sql`/* advanceMicrosoftStoreSourceRecoveryCursor */ INSERT INTO membership_microsoft_store_recovery_cursors (id, last_source_id, sweep_upper_bound_id) VALUES (${RECOVERY_CURSOR_ID}, ${lastSourceId}::UUID, ${upperBound}::UUID) ON CONFLICT (id) DO UPDATE SET last_source_id = EXCLUDED.last_source_id, sweep_upper_bound_id = EXCLUDED.sweep_upper_bound_id, updated_at = CURRENT_TIMESTAMP WHERE membership_microsoft_store_recovery_cursors.last_source_id IS NOT DISTINCT FROM ${batch.previousCursor}::UUID AND membership_microsoft_store_recovery_cursors.sweep_upper_bound_id IS NOT DISTINCT FROM ${batch.previousUpperBound}::UUID`,
  )
  return rowCount === 1
}
export async function reconcileMicrosoftStoreSource(options: {
  sourceId: string
  client?: MicrosoftStoreClient
}): Promise<void> {
  const verificationId = await findOrCreateRecoveryVerification(options.sourceId)
  if (!verificationId) return
  await processMicrosoftStoreMembershipVerification(verificationId, {
    client: options.client ?? createConfiguredMicrosoftStoreClient(),
  })
}
async function findOrCreateRecoveryVerification(sourceId: string): Promise<string | null> {
  await using query = await beginTransaction()
  const context = await getSourceContext(sourceId, query)
  if (!context) return null
  const evidence = recoveryEvidence(context)
  const requestFingerprint = createMembershipVerificationFingerprint(
    'microsoft_store',
    null,
    evidence,
  )
  const existingVerificationId = await findPendingRecoveryVerification(
    context,
    requestFingerprint,
    query,
  )
  if (existingVerificationId) {
    await query.commit()
    return existingVerificationId
  }
  const verification = await createMembershipVerificationInTransaction(
    {
      userId: context.userId,
      provider: 'microsoft_store',
      purchaseIntentId: null,
      idempotencyKey: recoveryIdempotencyKey(
        context.sourceId,
        context.collectionsKeyLookupSha256,
        context.purchaseKeyLookupSha256,
      ),
      trustedProviderContext: {
        environment: context.environment,
        applicationId: context.applicationId,
      },
      evidence,
    },
    query,
  )
  await query.commit()
  return verification.id
}
async function findRecoveryCursor(): Promise<{
  previousCursor: string | null
  previousUpperBound: string | null
}> {
  const { rows } = await write<{
    last_source_id: string | null
    sweep_upper_bound_id: string | null
  }>(
    sql`/* findMicrosoftStoreSourceRecoveryCursor */ SELECT last_source_id, sweep_upper_bound_id FROM membership_microsoft_store_recovery_cursors WHERE id = ${RECOVERY_CURSOR_ID}`,
  )
  return {
    previousCursor: rows[0]?.last_source_id ?? null,
    previousUpperBound: rows[0]?.sweep_upper_bound_id ?? null,
  }
}
async function findSourcesAfterCursor(
  cursor: string | null,
  upperBound: string | null,
): Promise<string[]> {
  const { rows } = await write<{ sourceId: string }>(
    sql`/* findRecoverableMicrosoftStoreSourceJobs.sources */ SELECT source.id AS "sourceId" FROM membership_sources source INNER JOIN membership_source_states state ON state.membership_source_id = source.id INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id INNER JOIN membership_microsoft_store_credentials credential ON credential.user_id = source.user_id AND credential.environment = lineage.environment AND credential.application_id = lineage.application_id WHERE source.source_kind = 'direct' AND source.user_id IS NOT NULL AND lineage.provider = 'microsoft_store' AND credential.collections_expires_at > CURRENT_TIMESTAMP AND credential.purchase_expires_at > CURRENT_TIMESTAMP AND (${cursor}::UUID IS NULL OR source.id > ${cursor}::UUID) AND (${upperBound}::UUID IS NULL OR source.id <= ${upperBound}::UUID) ORDER BY source.id LIMIT ${RECOVERY_BATCH_SIZE + 1}`,
  )
  return rows.map(row => row.sourceId)
}
async function findSourceSweepUpperBound(): Promise<string | null> {
  const { rows } = await write<{ sourceId: string }>(
    sql`/* findMicrosoftStoreSourceRecoverySweepUpperBound */ SELECT source.id AS "sourceId" FROM membership_sources source INNER JOIN membership_source_states state ON state.membership_source_id = source.id INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id INNER JOIN membership_microsoft_store_credentials credential ON credential.user_id = source.user_id AND credential.environment = lineage.environment AND credential.application_id = lineage.application_id WHERE source.source_kind = 'direct' AND source.user_id IS NOT NULL AND lineage.provider = 'microsoft_store' AND credential.collections_expires_at > CURRENT_TIMESTAMP AND credential.purchase_expires_at > CURRENT_TIMESTAMP ORDER BY source.id DESC LIMIT 1`,
  )
  return rows[0]?.sourceId ?? null
}
function recoveryEvidence(context: MicrosoftStoreSourceRecoveryContext) {
  const lineage = recoveryLineageIdentity(context)
  const collectionsKey = decryptSecret(
    context.encryptedCollectionsKey.toString(),
    `membership-microsoft-store-collections:${context.collectionsKeyLookupSha256}`,
  )
  const purchaseKey = decryptSecret(
    context.encryptedPurchaseKey.toString(),
    `membership-microsoft-store-purchase:${context.purchaseKeyLookupSha256}`,
  )
  return {
    collections_store_id_key: collectionsKey,
    purchase_store_id_key: purchaseKey,
    publisher_user_id: context.publisherUserId,
    product_id: context.providerProductId,
    sku_id: context.mappingSkuId,
    recovery_source_id: context.sourceId,
    recovery_sku_id: lineage.skuId,
    recovery_recurrence_id: lineage.recurrenceId,
  }
}
async function findPendingRecoveryVerification(
  context: MicrosoftStoreSourceRecoveryContext,
  requestFingerprint: string,
  query: QueryExecutor,
): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    sql`/* findPendingMicrosoftStoreSourceRecoveryVerification */ SELECT id
      FROM membership_verifications
      WHERE user_id = ${context.userId} AND provider = 'microsoft_store'
        AND environment = ${context.environment} AND application_id = ${context.applicationId}
        AND request_fingerprint = ${requestFingerprint} AND verified_at IS NULL
        AND conflicted_at IS NULL AND rejected_at IS NULL
      LIMIT 1`,
  )
  return rows[0]?.id ?? null
}
async function getSourceContext(
  sourceId: string,
  query: QueryExecutor,
): Promise<MicrosoftStoreSourceRecoveryContext | null> {
  const { rows } = await query<MicrosoftStoreSourceRecoveryContext>(
    sql`/* getMicrosoftStoreSourceRecoveryContext */ SELECT source.id AS "sourceId", source.user_id AS "userId", lineage.environment, lineage.application_id AS "applicationId", lineage.provider_lineage_id AS "providerLineageId", credential.publisher_user_id AS "publisherUserId", mapping.provider_product_id AS "providerProductId", mapping.sku_id AS "mappingSkuId", credential.encrypted_collections_key AS "encryptedCollectionsKey", credential.collections_key_lookup_sha256 AS "collectionsKeyLookupSha256", credential.encrypted_purchase_key AS "encryptedPurchaseKey", credential.purchase_key_lookup_sha256 AS "purchaseKeyLookupSha256" FROM membership_sources source INNER JOIN membership_source_states state ON state.membership_source_id = source.id INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id INNER JOIN membership_microsoft_store_credentials credential ON credential.user_id = source.user_id AND credential.environment = lineage.environment AND credential.application_id = lineage.application_id INNER JOIN membership_provider_observations observation ON observation.id = state.membership_provider_observation_id INNER JOIN membership_provider_products mapping ON mapping.id = observation.membership_provider_product_id WHERE source.id = ${sourceId}::UUID AND source.source_kind = 'direct' AND source.user_id IS NOT NULL AND lineage.provider = 'microsoft_store' AND credential.collections_expires_at > CURRENT_TIMESTAMP AND credential.purchase_expires_at > CURRENT_TIMESTAMP FOR UPDATE OF source`,
  )
  return rows[0] ?? null
}
function recoveryIdempotencyKey(
  sourceId: string,
  collectionsDigest: string,
  purchaseDigest: string,
): string {
  const digest = createHash('sha256')
    .update(
      `microsoft-store-source:${sourceId}:${collectionsDigest}:${purchaseDigest}:${Math.floor(Date.now() / SWEEP_BUCKET_MS)}`,
    )
    .digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}
