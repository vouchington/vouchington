import { randomUUID } from 'node:crypto'
import {
  createQueue,
  closeAndUnregisterGlideMQInstance,
} from '../../data-stores/valkey-glide-mq/glide-mq-factory.mts'
import { enqueueCommunityActivityDigestDispatch } from '../../queues/notifications/enqueues/community-activity-digest.mts'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { processCommunityActivityDigestScheduleTick } from '../../workers/notifications/processors/community-activity-digest-schedule.mts'
import {
  getTestCommunityActivityDigestWorkItems,
  insertTestCommunityActivityDigestWorkItem,
  readNextTestCommunityActivityDigestWindowStart,
  withTestCommunityActivityDigestLock,
} from '@voucha/test-helpers'
import {
  claimCommunityActivityDigestWorkItem,
  completeCommunityActivityDigestWorkItem,
  prepareCommunityActivityDigestWorkItems,
} from './community-activity-digest-dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('community activity digest work items', () => {
  it('releases the durable lease when queue admission fails', async () => {
    await withTestCommunityActivityDigestLock(async () => {
      const queue = createQueue(`digest-admission-${randomUUID()}`)
      const admission = vi.spyOn(queue, 'add')
      let started: ReturnType<typeof processCommunityActivityDigestScheduleTick> | undefined
      let cleanupPromise: Promise<void> | undefined
      const cleanup = () =>
        (cleanupPromise ??= (async () => {
          if (started) await Promise.allSettled([started])
          try {
            await closeAndUnregisterGlideMQInstance(queue)
          } finally {
            admission.mockRestore()
          }
        })())
      onTestFinished(cleanup, 5000)
      try {
        await queue.close()
        const windowStart = await readNextTestCommunityActivityDigestWindowStart()
        const foreignStart = new Date(windowStart.getTime() - 3 * 24 * 60 * 60 * 1000)
        await expect(
          (started = processCommunityActivityDigestScheduleTick(
            {},
            {
              prepareCommunityActivityDigestWorkItems: async () => {
                const windows = await prepareCommunityActivityDigestWorkItems(windowStart, [
                  windowStart,
                ])
                await insertTestCommunityActivityDigestWorkItem(foreignStart)
                return windows
              },
              enqueueCommunityActivityDigestDispatch: data =>
                enqueueCommunityActivityDigestDispatch(data, { queue }),
            },
          )),
        ).rejects.toThrow(/clos/i)
        expect(admission).toHaveBeenCalledTimes(1)
        expect(admission).toHaveBeenCalledWith(
          'processCommunityActivityDigestDispatch',
          expect.objectContaining({
            windowStart: windowStart.toISOString(),
            leaseToken: expect.any(String),
          }),
          expect.any(Object),
        )
        const stored = await getTestCommunityActivityDigestWorkItems()
        expect(
          stored.find(row => row.window_starts_at.toISOString() === windowStart.toISOString()),
        ).toMatchObject({ lease_token: null, completed_at: null, attempt_count: 1 })
        expect(
          stored.find(row => row.window_starts_at.toISOString() === foreignStart.toISOString()),
        ).toMatchObject({ lease_token: null, completed_at: null, attempt_count: 0 })
        const successor = await claimCommunityActivityDigestWorkItem(windowStart)
        expect(successor).toBeTypeOf('string')
        if (!successor) throw new Error('Expected released digest work to be immediately claimable')
        await expect(completeCommunityActivityDigestWorkItem(windowStart, successor)).resolves.toBe(
          true,
        )
      } finally {
        await cleanup()
      }
    })
  })
})
