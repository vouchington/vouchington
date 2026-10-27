import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-waiter'
import { lockTopicRssFeedAttachmentLifecycles } from './lock.mts'

describe('topic RSS feed attachment lifecycle fence', () => {
  it('makes a different transaction wait for the held topic fence', async () => {
    const topicId = randomUUID()
    await using holder = await beginTransaction()
    await lockTopicRssFeedAttachmentLifecycles(holder, [topicId])
    await using waiter = await createTestPostgresLockWaiter({
      holder,
      lock: { kind: 'advisory64', key: `topic-rss-feed-attachment:${topicId.toLowerCase()}` },
      selected: {
        marker: '/* lockTopicRssFeedAttachmentLifecycles */',
        binding: { index: 1, value: [topicId.toLowerCase()] },
      },
    })
    const waiterLock = lockTopicRssFeedAttachmentLifecycles(waiter.query, [topicId])
    try {
      await expect(waiter.waitForLock(waiterLock)).resolves.toBeUndefined()
    } finally {
      await holder.commit()
    }
    await waiterLock
    await waiter.query.commit()
  })
})
