import '../../test-helpers/vitest.setup.stored-secret-encryption-keys.mts'
import { onTestFinished } from 'vitest'
import type { Job } from 'glide-mq'
import type { RecoverAppleNotificationsData } from '../queues/memberships/types.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { Environment, type JWSTransactionDecodedPayload } from '@apple/app-store-server-library'
import { memberships } from '../queues/memberships/queues.mts'
import { ingestAppleAppStoreNotification } from '../services/memberships/apple/notification-ingress.mts'
import type { AppleNotificationVerifier } from '../services/memberships/apple/types.mts'

export async function createTestAppleRecoveryNotification(
  providerLineageId = 'original-transaction-id',
) {
  const notificationId = randomUUID()
  const accepted = await ingestAppleAppStoreNotification({
    evidence: { signedPayload: `signed-notification-${notificationId}` },
    environment: 'test',
    applicationId: 'ai.voucha.ios',
    verifier: makeVerifier(notificationId, providerLineageId),
  })
  const jobId = `apple-notification__${accepted.evidenceId}`
  const job = await memberships.getJob(jobId)
  if (!job) throw new Error('Expected notification ingress to enqueue its stable job')
  await job.remove()
  return { evidenceId: accepted.evidenceId, providerLineageId, environment: 'test' as const, jobId }
}

function makeVerifier(
  notificationId: string,
  providerLineageId: string,
): AppleNotificationVerifier {
  return {
    async verifyAndDecodeNotification() {
      return {
        notificationUUID: notificationId,
        data: {
          bundleId: 'ai.voucha.ios',
          environment: Environment.SANDBOX,
          signedTransactionInfo: 'signed-transaction',
        },
      }
    },
    async verifyAndDecodeTransaction(): Promise<JWSTransactionDecodedPayload> {
      return {
        originalTransactionId: providerLineageId,
        bundleId: 'ai.voucha.ios',
        environment: Environment.SANDBOX,
      }
    },
  }
}

/** Recovery only needs durable provider identity; the provider verifier never consumes these fixtures. */
export async function createTestPendingRecoveryEvidence(input: {
  provider: 'apple_app_store' | 'stripe'
  receivedAt: string
}) {
  const identity = randomUUID()
  const { rows } = await write<{ id: string }>(sql`/* createTestPendingRecoveryEvidence */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
      VALUES (fn_upsert_membership_provider_context_id(${input.provider}, 'test', ${`recovery-${identity}`}), ${identity})
      RETURNING id, membership_provider_context_id
    )
    INSERT INTO membership_provider_evidence_records (membership_provider_context_id,
      membership_provider_lineage_id, provider_event_id, evidence_lookup_sha256, encrypted_evidence, received_at)
    SELECT membership_provider_context_id, id, ${identity}, ${identity.replaceAll('-', '').repeat(2)},
      ${Buffer.from('synthetic recovery evidence')}, ${input.receivedAt}::timestamptz
    FROM lineage RETURNING id`)
  const evidenceId = rows[0]!.id
  return {
    evidenceId,
    providerLineageId: identity,
    environment: 'test' as const,
    jobId: `apple-notification__${evidenceId}`,
  }
}

export async function createTestAppleRecoveryJob(data: RecoverAppleNotificationsData = {}) {
  const job = await memberships.add('recoverAppleNotifications', data, {
    jobId: `test-apple-recovery-${randomUUID()}`,
  })
  if (!job) throw new Error('Expected an owned Apple recovery job')
  onTestFinished(async () => {
    await (await memberships.getJob(job.id))?.remove()
  })
  return job as Job<RecoverAppleNotificationsData>
}
