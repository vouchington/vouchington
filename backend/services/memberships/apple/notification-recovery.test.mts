import { randomUUID } from 'node:crypto'
import { Environment, type JWSTransactionDecodedPayload } from '@apple/app-store-server-library'
import { afterEach, describe, expect, it } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { removeQueuedJobsById } from '../../../test-helpers/shared-queue-cleanup.mts'
import { ingestAppleAppStoreNotification } from './notification-ingress.mts'
import { findRecoverableAppleNotificationJobs } from './notification-recovery.mts'
import type { AppleNotificationVerifier } from './types.mts'

describe('Apple notification recovery', () => {
  const ownedJobIds: string[] = []
  afterEach(async () => {
    await removeQueuedJobsById(memberships, ownedJobIds.splice(0))
  })

  it('finds bounded durable notification work after queue loss', async () => {
    const notificationId = randomUUID()
    const accepted = await ingestAppleAppStoreNotification({
      evidence: { signedPayload: `signed-notification-${notificationId}` },
      environment: 'test',
      applicationId: 'ai.voucha.ios',
      verifier: makeVerifier(notificationId),
    })
    // Queue loss: drop this notification's stable job, as a flushed queue would.
    const jobId = `apple-notification__${accepted.evidenceId}`
    ownedJobIds.push(jobId)
    await removeQueuedJobsById(memberships, [jobId])

    const recoverable = await findRecoverableAppleNotificationJobs()

    expect(recoverable).toContainEqual({
      evidenceId: accepted.evidenceId,
      providerLineageId: 'original-transaction-id',
      environment: 'test',
    })
  })
})

function makeVerifier(notificationId: string): AppleNotificationVerifier {
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
        originalTransactionId: 'original-transaction-id',
        bundleId: 'ai.voucha.ios',
        environment: Environment.SANDBOX,
      }
    },
  }
}
