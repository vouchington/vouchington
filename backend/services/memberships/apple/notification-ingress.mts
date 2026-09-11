import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { enqueueProcessAppleNotification } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import type { AppleMembershipProviderEnvironment, AppleNotificationVerifier } from './types.mts'
import { verifyAppleNotification } from './verify-notification.mts'

export class InvalidAppleNotificationError extends Error {
  constructor() {
    super('Invalid Apple App Store notification.')
    this.name = 'InvalidAppleNotificationError'
  }
}

export async function ingestAppleAppStoreNotification(options: {
  evidence: unknown
  environment: AppleMembershipProviderEnvironment
  applicationId: string
  verifier: AppleNotificationVerifier
}): Promise<{ evidenceId: string; replayed: boolean }> {
  const notification = await verifyAppleNotification(options)
  if (!notification) throw new InvalidAppleNotificationError()
  const evidenceLookupSha256 = createHash('sha256')
    .update(`apple:notification:${options.environment}:${notification.notificationId}`)
    .digest('hex')
  await using query = await beginTransaction()
  const lineageId = await getOrCreateLineage(query, options, notification.providerLineageId)
  const evidence = await createOrGetEvidence(query, {
    ...options,
    ...notification,
    evidenceLookupSha256,
    lineageId,
  })
  await query.commit()
  await enqueueProcessAppleNotification({
    evidenceId: evidence.id,
    providerLineageId: notification.providerLineageId,
    environment: options.environment,
  })
  return { evidenceId: evidence.id, replayed: !evidence.inserted }
}

async function getOrCreateLineage(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  options: { environment: AppleMembershipProviderEnvironment; applicationId: string },
  providerLineageId: string,
): Promise<string> {
  const { rows: insertedRows } = await query<{
    id: string
  }>(sql`/* ingestAppleNotification.lineage */
    INSERT INTO membership_provider_lineages (
      provider, environment, application_id, provider_lineage_id
    ) VALUES ('apple_app_store', ${options.environment}, ${options.applicationId}, ${providerLineageId})
    ON CONFLICT (provider, environment, application_id, provider_lineage_id) DO NOTHING
    RETURNING id`)
  if (insertedRows[0]) return insertedRows[0].id
  const { rows } = await query<{ id: string }>(sql`/* ingestAppleNotification.existingLineage */
    SELECT id FROM membership_provider_lineages
    WHERE provider = 'apple_app_store' AND environment = ${options.environment}
      AND application_id = ${options.applicationId} AND provider_lineage_id = ${providerLineageId}
    FOR KEY SHARE`)
  const lineage = rows[0]
  if (!lineage) throw new Error('Apple notification lineage was not returned')
  return lineage.id
}

async function createOrGetEvidence(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  options: {
    environment: AppleMembershipProviderEnvironment
    applicationId: string
    notificationId: string
    signedPayload: string
    evidenceLookupSha256: string
    lineageId: string
  },
): Promise<{ id: string; inserted: boolean }> {
  const encryptedEvidence = Buffer.from(
    encryptSecret(
      options.signedPayload,
      `membership-provider-evidence:apple_app_store:${options.evidenceLookupSha256}`,
    ),
  )
  const { rows: insertedRows } = await query<{
    id: string
  }>(sql`/* ingestAppleNotification.evidence */
    INSERT INTO membership_provider_evidence_records (
      provider, environment, application_id, membership_provider_lineage_id, provider_event_id,
      evidence_lookup_sha256, encrypted_evidence
    ) VALUES (
      'apple_app_store', ${options.environment}, ${options.applicationId}, ${options.lineageId},
      ${options.notificationId}, ${options.evidenceLookupSha256}, ${encryptedEvidence}
    ) ON CONFLICT (provider, environment, application_id, provider_event_id)
      WHERE provider_event_id IS NOT NULL DO NOTHING
    RETURNING id`)
  if (insertedRows[0]) return { id: insertedRows[0].id, inserted: true }
  const { rows } = await query<{ id: string; membership_provider_lineage_id: string }>(
    sql`/* ingestAppleNotification.existingEvidence */
      SELECT id, membership_provider_lineage_id FROM membership_provider_evidence_records
      WHERE provider = 'apple_app_store' AND environment = ${options.environment}
        AND application_id = ${options.applicationId} AND provider_event_id = ${options.notificationId}
      FOR KEY SHARE`,
  )
  const evidence = rows[0]
  if (!evidence || evidence.membership_provider_lineage_id !== options.lineageId)
    throw new Error('Apple notification identity conflicts with its lineage')
  return { id: evidence.id, inserted: false }
}
