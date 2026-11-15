import { readAllQueueJobs } from '@voucha/test-helpers'
import type { RecoverAppleNotificationsData } from '@queues/memberships/types'
import { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'
import { describe, expect, it, vi, onTestFinished } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import {
  createTestAppleRecoveryNotification,
  createTestAppleRecoveryJob,
  createTestPendingRecoveryEvidence,
} from '@voucha/test-helpers/apple-recovery-fixtures'
import { recoverAppleNotifications } from './apple-notification-recovery.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('Apple notification recovery with real GlideMQ', () => {
  it('restores owned lost stable jobs and keeps concurrent recovery deduplicated', async () => {
    const neighbor = await createTestAppleRecoveryNotification()
    const owned = await createTestAppleRecoveryNotification()

    try {
      await expect(memberships.getJob(owned.jobId)).resolves.toBeNull()
      await expect(
        recoverAppleNotifications(await createTestAppleRecoveryJob(), {
          evidenceIds: [owned.evidenceId],
          batchSize: 1,
        }),
      ).resolves.toEqual({
        enqueued: 1,
      })
      await expect(
        recoverAppleNotifications(await createTestAppleRecoveryJob(), {
          evidenceIds: [owned.evidenceId],
          batchSize: 2,
        }),
      ).resolves.toEqual({
        enqueued: 1,
      })
      await expect(
        Promise.all([
          recoverAppleNotifications(await createTestAppleRecoveryJob(), {
            evidenceIds: [owned.evidenceId],
            batchSize: 1,
          }),
          recoverAppleNotifications(await createTestAppleRecoveryJob(), {
            evidenceIds: [owned.evidenceId],
            batchSize: 1,
          }),
        ]),
      ).resolves.toEqual([{ enqueued: 1 }, { enqueued: 1 }])

      await expect(memberships.getJob(owned.jobId)).resolves.toMatchObject({
        id: owned.jobId,
        name: 'processAppleNotification',
        data: {
          evidenceId: owned.evidenceId,
          providerLineageId: 'original-transaction-id',
          environment: 'test',
        },
        opts: { deduplication: { id: owned.jobId, mode: 'simple' } },
      })
      await expect(memberships.getJob(neighbor.jobId)).resolves.toBeNull()
    } finally {
      const job = await memberships.getJob(owned.jobId)
      await job?.remove()
    }
  })
  it('continues an empty inspected page and only dispatches its owned Apple evidence', async () => {
    const ignored = await createTestPendingRecoveryEvidence({
      provider: 'stripe',
      receivedAt: '2026-01-01 00:00:00.123456+00',
    })
    const owned = await createTestPendingRecoveryEvidence({
      provider: 'apple_app_store',
      receivedAt: '2026-01-01 00:00:00.123457+00',
    })
    const neighbor = await createTestPendingRecoveryEvidence({
      provider: 'apple_app_store',
      receivedAt: '2026-01-01 00:00:00.123455+00',
    })
    const evidenceIds = [ignored.evidenceId, owned.evidenceId]
    const page = await findRecoverableAppleNotificationJobs({ evidenceIds, batchSize: 1 })
    expect(page).toMatchObject({
      notifications: [],
      inspected: 1,
      hasMore: true,
      nextCursor: { evidenceId: ignored.evidenceId },
      through: { evidenceId: owned.evidenceId },
    })
    expect(page.nextCursor?.receivedAt).toContain('.123456')
    const rootJob = await createTestAppleRecoveryJob()
    await expect(
      recoverAppleNotifications(rootJob, { evidenceIds, batchSize: 1 }),
    ).resolves.toEqual({ enqueued: 0 })
    expect(rootJob.data.through).toEqual(page.through)
    const continuations = (await readAllQueueJobs(memberships)).filter(
      job =>
        job.name === 'recoverAppleNotifications' &&
        (job.data as RecoverAppleNotificationsData).after?.evidenceId === ignored.evidenceId,
    )
    expect(continuations).toHaveLength(1)
    const continuation = continuations[0]!
    onTestFinished(async () => {
      await (await memberships.getJob(continuation.id))?.remove()
      await (await memberships.getJob(owned.jobId))?.remove()
    })
    const data = JSON.parse(JSON.stringify(continuation.data)) as RecoverAppleNotificationsData
    expect(data).toEqual({ after: page.nextCursor, through: page.through })
    await expect(
      recoverAppleNotifications(await createTestAppleRecoveryJob(data), {
        evidenceIds,
        batchSize: 1,
      }),
    ).resolves.toEqual({ enqueued: 1 })
    await expect(memberships.getJob(owned.jobId)).resolves.toMatchObject({
      name: 'processAppleNotification',
      data: {
        evidenceId: owned.evidenceId,
        providerLineageId: owned.providerLineageId,
        environment: 'test',
      },
    })
    await expect(memberships.getJob(ignored.jobId)).resolves.toBeNull()
    await expect(memberships.getJob(neighbor.jobId)).resolves.toBeNull()
  })
})
