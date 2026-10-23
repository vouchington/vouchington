import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import { ARTICLE_SYNC_PROCESS_JOB } from '@queues/background/enqueues/article-sync-jobs'
import { OPENAI_MODERATION_POST_JOB } from '@queues/background/enqueues/openai-moderation-jobs'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('account-lifecycle and article-sync groups through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('runs at most two account-lifecycle jobs of any name at once across workers', async () => {
    let active = 0
    let maxActive = 0
    const started: string[] = []
    const twoStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const otherDomainRan = Promise.withResolvers<void>()
    const track = async (job: { id: string }): Promise<void> => {
      started.push(job.id)
      active += 1
      maxActive = Math.max(maxActive, active)
      if (active === 2) twoStarted.resolve()
      await release.promise
      active -= 1
    }
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      concurrency: 2,
      bodies: {
        [ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB.name]: track,
        [ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name]: track,
        [OPENAI_MODERATION_POST_JOB.name]: () => otherDomainRan.resolve(),
      },
    })
    harness.registerBeforeClose(() => release.resolve())
    try {
      const flood = await Promise.all([
        ...Array.from({ length: 3 }, () =>
          harness!.add(ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB, {
            requestId: randomUUID(),
            userId: randomUUID(),
            processingAttemptId: randomUUID(),
          }),
        ),
        ...Array.from({ length: 3 }, () =>
          harness!.add(ACCOUNT_LIFECYCLE_USER_DELETION_JOB, {
            requestId: randomUUID(),
            processingAttemptId: randomUUID(),
          }),
        ),
      ])
      await twoStarted.promise
      const other = await harness.add(OPENAI_MODERATION_POST_JOB, { id: randomUUID() })

      // Both workers have free slots; the group parked every account job past the second.
      await otherDomainRan.promise
      expect(started).toHaveLength(2)
      expect(maxActive).toBe(2)

      release.resolve()
      await Promise.all([...flood, other].map(job => harness!.settled(job)))
      expect(started).toHaveLength(flood.length)
      expect(maxActive).toBe(2)
    } finally {
      release.resolve()
    }
  })

  it('runs article syncs one at a time across workers', async () => {
    let active = 0
    let maxActive = 0
    const started: string[] = []
    const firstStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const otherDomainRan = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      bodies: {
        [ARTICLE_SYNC_PROCESS_JOB.name]: async job => {
          started.push(job.id)
          active += 1
          maxActive = Math.max(maxActive, active)
          firstStarted.resolve()
          await release.promise
          active -= 1
        },
        [OPENAI_MODERATION_POST_JOB.name]: () => otherDomainRan.resolve(),
      },
    })
    harness.registerBeforeClose(() => release.resolve())
    try {
      const flood = await Promise.all(
        Array.from({ length: 4 }, () =>
          harness!.add(ARTICLE_SYNC_PROCESS_JOB, { userId: randomUUID() }),
        ),
      )
      await firstStarted.promise
      const other = await harness.add(OPENAI_MODERATION_POST_JOB, { id: randomUUID() })

      await otherDomainRan.promise
      expect(started).toHaveLength(1)
      expect(maxActive).toBe(1)

      release.resolve()
      await Promise.all([...flood, other].map(job => harness!.settled(job)))
      expect(started).toHaveLength(flood.length)
      expect(maxActive).toBe(1)
    } finally {
      release.resolve()
    }
  })
})
