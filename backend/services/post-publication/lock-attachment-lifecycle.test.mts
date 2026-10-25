import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { lockTopicRssFeedAttachmentLifecycles } from './lock.mts'

describe('topic RSS feed attachment lifecycle fence', () => {
  it('makes a different transaction wait for the held topic fence', async () => {
    const topicId = randomUUID()
    await using holder = await beginTransaction()
    await using waiter = await beginTransaction()
    await lockTopicRssFeedAttachmentLifecycles(holder, [topicId])
    const holderPid = await getTestPostgresBackendProcessId(holder)
    const waiterLock = lockTopicRssFeedAttachmentLifecycles(waiter, [topicId])
    try {
      await expect(
        waitForTestPostgresLockWaiter(holderPid, 'lockTopicRssFeedAttachmentLifecycles'),
      ).resolves.toBeUndefined()
    } finally {
      await holder.commit()
    }
    await waiterLock
    await waiter.commit()
  })
})
