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
