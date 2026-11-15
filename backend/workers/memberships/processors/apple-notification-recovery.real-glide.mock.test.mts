import { once } from 'node:events'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { openMembershipQueueHarness } from '@voucha/test-helpers/membership-verification-queue-assertions'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
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
  it('keeps the cursor while full and resumes after capacity becomes available', async () => {
    const owned = await createTestAppleRecoveryNotification()
    const heldFirst = await createTestAppleRecoveryJob()
    const heldSecond = await createTestAppleRecoveryJob()
    const counts = await memberships.getJobCounts()
    const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
        memberships_max_depth: depth,
      }),
    )
    const page = await findRecoverableAppleNotificationJobs({
      evidenceIds: [owned.evidenceId],
      batchSize: 1,
    })
    const initial = { through: page.through! }
    const harness = await openMembershipQueueHarness(
      'apple-capacity',
      async job => {
        await recoverAppleNotifications(job, { evidenceIds: [owned.evidenceId], batchSize: 1 })
      },
      { concurrency: 1 },
    )
    onTestFinished(() => harness.close())
    onTestFinished(async () => {
      await (await memberships.getJob(owned.jobId))?.remove()
    })
    const delayed = waitForRealGlideEvent(
      once(harness.events, 'delay-changed'),
      'Apple capacity delay',
    )
    const job = await harness.queue.add('recoverAppleNotifications', initial)
    expect(job).not.toBeNull()
    await delayed
    const retained = await harness.queue.getJob(job!.id)
    expect(await retained!.getState()).toBe('delayed')
    expect(retained!.data).toEqual(initial)
    expect(retained!.attemptsMade).toBe(0)
    await expect(memberships.getJob(owned.jobId)).resolves.toBeNull()
    await heldFirst.remove()
    await heldSecond.remove()
    const completed = waitForRealGlideEvent(
      once(harness.events, 'completed'),
      'Apple capacity resume',
    )
    await retained!.promote()
    await completed
    await expect(memberships.getJob(owned.jobId)).resolves.toMatchObject({
      name: 'processAppleNotification',
      data: { evidenceId: owned.evidenceId },
    })
  })

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
