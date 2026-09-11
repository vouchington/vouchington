import {
  closeAndUnregisterGlideMQInstance,
  createQueue,
  createWorker,
} from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from '@queues/post-publication/config'
import {
  getTestPostPublicationDirtyWorkForScope,
  hasTestPostPublicationProjectionReceipt,
  insertTestPost,
  beginTransaction,
  createTestUser,
} from '@voucha/test-helpers'
import { recordPostPublicationChange } from '@services/post-publication'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { processReconcilePostPublication } from './processors.mts'
import { randomUUID } from 'node:crypto'

describe('post publication worker integration', () => {
  const instances: Array<{ close(): Promise<void> }> = []

  afterEach(async () => {
    await Promise.all(instances.splice(0).map(closeAndUnregisterGlideMQInstance))
  })

  it('processes queued capture through real storage effects, receipt, and acknowledgement', async () => {
    const postId = await createPublicationWork('queued')
    const captured = await getRequiredWork(postId)
    const enqueueContinuation = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
    const queueName = `${QUEUE_NAME}-test-${randomUUID()}`
    const queue = createQueue(queueName)
    instances.push(
      queue,
      createWorker(queueName, job =>
        processReconcilePostPublication(job.data as Record<string, never>, {
          // The in-memory queue shim cannot drain a same-queue job enqueued by its active worker.
          enqueueContinuePostPublicationReconciliation: enqueueContinuation,
          listAvailablePostPublicationDirtyWork: () => Promise.resolve([captured]),
        }),
      ),
    )

    await queue.add('processReconcilePostPublication', {})

    await expect
      .poll(() => getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }), {
        timeout: 5_000,
      })
      .toBeUndefined()
    await expect(hasTestPostPublicationProjectionReceipt(postId)).resolves.toBe(true)
    expect(enqueueContinuation).toHaveBeenCalledOnce()
  })

  it('leaves real work unacknowledged after an external effect failure and retries it', async () => {
    const postId = await createPublicationWork('retry')
    const captured = await getRequiredWork(postId)
    const effectFailure = new Error('injected cache boundary failure')

    await expect(
      processReconcilePostPublication(
        {},
        {
          invalidatePost: vi
            .fn<(...keys: unknown[]) => Promise<void>>()
            .mockRejectedValue(effectFailure),
          listAvailablePostPublicationDirtyWork: () => Promise.resolve([captured]),
        },
      ),
    ).rejects.toBe(effectFailure)
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toBeDefined()
    await expect(hasTestPostPublicationProjectionReceipt(postId)).resolves.toBe(false)

    await expect(
      processReconcilePostPublication(
        {},
        {
          listAvailablePostPublicationDirtyWork: () => Promise.resolve([captured]),
        },
      ),
    ).resolves.toEqual({ reconciled: 1 })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toBeUndefined()
    await expect(hasTestPostPublicationProjectionReceipt(postId)).resolves.toBe(true)
  })
})

async function getRequiredWork(postId: string) {
  const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })
  if (!work) throw new Error('Expected captured publication work')
  return work
}

async function createPublicationWork(label: string): Promise<string> {
  const user = await createTestUser()
  if (!user) throw new Error('Expected publication integration user')
  const postId = await insertTestPost({
    title: `Publication worker ${label}`,
    slug: `publication-worker-${label}-${randomUUID()}`,
    markdown: 'Worker integration fixture.',
    createdById: user.id,
  })
  await using transaction = await beginTransaction()
  await recordPostPublicationChange(transaction, {
    scope: { type: 'post', postId },
    reason: 'post_created',
  })
  await transaction.commit()
  return postId
}
