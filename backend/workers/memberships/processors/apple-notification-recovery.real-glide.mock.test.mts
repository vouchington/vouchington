import { randomUUID } from 'node:crypto'
import { Environment, type JWSTransactionDecodedPayload } from '@apple/app-store-server-library'
import { describe, expect, it, vi } from 'vitest'
import { enqueueBulkProcessAppleNotifications } from '@queues/memberships/enqueues'
import { memberships } from '@queues/memberships/queues'
import {
  findRecoverableAppleNotificationJobs,
  ingestAppleAppStoreNotification,
  type AppleNotificationVerifier,
} from '@services/memberships/apple'
import { recoverAppleNotifications } from './apple-notification-recovery.mts'

vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

describe('Apple notification recovery with real GlideMQ', () => {
  it('restores a lost stable job from PostgreSQL and keeps concurrent recovery deduplicated', async () => {
    const notificationId = randomUUID()
    const accepted = await ingestAppleAppStoreNotification({
      evidence: { signedPayload: `signed-notification-${notificationId}` },
      environment: 'test',
      applicationId: 'ai.voucha.ios',
      verifier: makeVerifier(notificationId),
    })
    const jobId = `apple-notification__${accepted.evidenceId}`

    try {
      const initialJob = await memberships.getJob(jobId)
      if (!initialJob) throw new Error('Expected the notification enqueue to create its stable job')
      await initialJob.remove()
      await expect(memberships.getJob(jobId)).resolves.toBeNull()

      const findOnlyThisNotification = async () =>
        (await findRecoverableAppleNotificationJobs()).filter(
          notification => notification.evidenceId === accepted.evidenceId,
        )
      const dependencies = {
        findRecoverableAppleNotificationJobs: findOnlyThisNotification,
        enqueueBulkProcessAppleNotifications,
      }
      await expect(recoverAppleNotifications(dependencies)).resolves.toEqual({ enqueued: 1 })
      await Promise.all([
        recoverAppleNotifications(dependencies),
        recoverAppleNotifications(dependencies),
      ])

      await expect(memberships.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        name: 'processAppleNotification',
        data: {
          evidenceId: accepted.evidenceId,
          providerLineageId: 'original-transaction-id',
          environment: 'test',
        },
        opts: { deduplication: { id: jobId, mode: 'simple' } },
      })
    } finally {
      const job = await memberships.getJob(jobId)
      await job?.remove()
    }
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
