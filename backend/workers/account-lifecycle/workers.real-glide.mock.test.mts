import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createDataRequest } from '@services/account-data-requests'
import { createUserDeletionRequest } from '@services/user-deletions'
import { accountLifecycle } from '@queues/account-lifecycle/queues'
import {
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  createTestUser,
  expireUserDataRequestForTest,
  getUserDataRequestStatusAndS3KeyForTest,
  makeUserDataRequestRecoverableForTest,
} from '@voucha/test-helpers'
import {
  getUserDeletionRequestForTest,
  makeUserDeletionRecoverableForTest,
} from '@voucha/test-helpers/services/user-deletions/lifecycle.test-support'
// A relative import: @workers/background depends on this package, so a package dependency would cycle.
import { createBackgroundProcessor } from '../background/processors.mts'
import { accountLifecycleHandlers } from './workers.mts'

// Keep the actual transport; only the external S3 provider call is replaced below.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())
const mockS3Send = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: { send: mockS3Send } as unknown as typeof import('@modules/aws').S3ImagesClient,
}))

function sentCommandName(command: unknown): string {
  return (command as { constructor: { name: string } }).constructor.name
}

const processAccountLifecycleJob = createBackgroundProcessor(
  new Map(accountLifecycleHandlers.map(handler => [handler.job.name, handler])),
)

async function runJob(name: string, data: Record<string, unknown>, priority = 10): Promise<void> {
  const prefix = `${workerQueuePrefix}-account-lifecycle-${randomUUID()}`
  const queue = new Queue(BACKGROUND_QUEUE_NAME, { connection: workerQueueConnection, prefix })
  let worker: Worker | undefined
  const completed = Promise.withResolvers<void>()
  try {
    const job = await queue.add(name, data, { priority, attempts: 1 })
    if (!job) throw new Error(`Expected ${name} to enqueue`)
    worker = new Worker(BACKGROUND_QUEUE_NAME, processAccountLifecycleJob, {
      connection: workerQueueConnection,
      prefix,
      concurrency: 1,
      blockTimeout: 1000,
    })
    worker.on('error', error => completed.reject(error))
    worker.on('failed', (_failed, error) => completed.reject(error))
    worker.on('completed', (done: Job) => {
      if (done.id === job.id) completed.resolve()
    })
    await completed.promise
  } finally {
    await worker?.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
}

describe('account-lifecycle real worker', () => {
  it('rejects an unknown retained job before invoking either account handler', async () => {
    await expect(runJob('unknownAccountLifecycleJob', {})).rejects.toThrow(
      'Unknown background job: unknownAccountLifecycleJob',
    )
  })

  it('exports an account and cleans up its expired archive through durable state', async () => {
    const subject = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const request = await createDataRequest(subject.id, administrator.id)
    mockS3Send.mockResolvedValue({})
    const expectedKey = `${request.id}/${request.processing_attempt_id}.zip`
    try {
      await runJob(ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB.name, {
        requestId: request.id,
        userId: subject.id,
        processingAttemptId: request.processing_attempt_id,
      })
      expect(await getUserDataRequestStatusAndS3KeyForTest(request.id)).toEqual({
        status: 'ready',
        s3_key: expectedKey,
      })
      expect(
        mockS3Send.mock.calls.some(([command]) => sentCommandName(command) === 'PutObjectCommand'),
      ).toBe(true)

      await expireUserDataRequestForTest(request.id)
      await runJob(ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.name, {})
      expect(await getUserDataRequestStatusAndS3KeyForTest(request.id)).toEqual({
        status: 'expired',
        s3_key: null,
      })
      expect(
        mockS3Send.mock.calls.some(
          ([command]) =>
            sentCommandName(command) === 'DeleteObjectsCommand' &&
            (
              command as { input: { Delete?: { Objects?: { Key?: string }[] } } }
            ).input.Delete?.Objects?.some(object => object.Key === expectedKey),
        ),
      ).toBe(true)
    } finally {
      mockS3Send.mockReset()
    }
  })

  it('recovers both request families and processes a fenced deletion batch', async () => {
    const exportUser = await createTestUser()
    const exportRequest = await createDataRequest(exportUser.id, exportUser.id)
    await makeUserDataRequestRecoverableForTest(exportRequest.id, 'unstarted')
    const exportJobId = `account-data-export__${exportRequest.id}__${exportRequest.processing_attempt_id}`

    const deletionUser = await createTestUser()
    const deletionRequest = await createUserDeletionRequest(deletionUser.id, deletionUser.id)
    await makeUserDeletionRecoverableForTest(deletionRequest.id, 'unstarted')
    const deletionJobId = `user-deletion__${deletionRequest.id}__${deletionRequest.processingAttemptId}`
    let successorId: string | undefined
    try {
      await runJob(ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.name, {}, 100)
      expect((await accountLifecycle.getJob(exportJobId))?.data).toEqual({
        requestId: exportRequest.id,
        userId: exportUser.id,
        processingAttemptId: exportRequest.processing_attempt_id,
      })

      await runJob(ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB.name, {}, 100)
      expect((await accountLifecycle.getJob(deletionJobId))?.data).toEqual({
        requestId: deletionRequest.id,
        processingAttemptId: deletionRequest.processingAttemptId,
      })

      await runJob(ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name, {
        requestId: deletionRequest.id,
        processingAttemptId: deletionRequest.processingAttemptId,
      })
      const after = await getUserDeletionRequestForTest(deletionRequest.id)
      expect(after?.processingAttempts).toBe(1)
      expect(after?.currentPhase).not.toBe('posts')
      if (after) {
        successorId = `user-deletion__${after.id}__${after.processingAttemptId}`
      }
    } finally {
      for (const id of [exportJobId, deletionJobId, successorId]) {
        if (id) await (await accountLifecycle.getJob(id))?.remove()
      }
    }
  })
})
