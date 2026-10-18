import { once } from 'node:events'
import { QueueEvents, type Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { backgroundQueueConfig } from '@queues/background/config'
import { IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB } from '@queues/background/enqueues/imports-jobs'
import {
  getRssFeedImport,
  submitRssFeedImport,
} from '@services/user-import-export/rss-feed-imports'
import { withRssFeedImportRowLock } from '@services/user-import-export/rss-feed-import-row-lock'
import { userRssFeedImportsHandlers } from '@workers/user-rss-feed-imports/workers'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getFirstRssFeedImportRowId } from '@voucha/test-helpers/rss-feed-import-rows'
import { startBackgroundHarness } from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('RSS feed import row contention on real GlideMQ', () => {
  it('defers only the busy row without spending an attempt, then completes it', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(backgroundQueueConfig, { pause_recheck_ms: 1_000 }),
    )
    const user = await createTestUser()
    const submitted = await submitRssFeedImport(user, WEB_PROVENANCE, ['not-a-feed-url'])
    const rowId = await getFirstRssFeedImportRowId(submitted.import.id)
    const handler = userRssFeedImportsHandlers.find(
      candidate => candidate.job.name === IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name,
    )
    if (!handler) throw new Error('RSS feed import row handler is not registered')

    const harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: { [handler.job.name]: (job: Job) => handler.handle(job) },
    })
    const events = new QueueEvents(harness.queue.name, {
      ...connection,
      lastEventId: '0',
      blockTimeout: 1_000,
    })
    const acquired = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holder = withRssFeedImportRowLock(rowId, async () => {
      acquired.resolve()
      await release.promise
    })

    try {
      await Promise.all([events.waitUntilReady(), acquired.promise])
      const delayed = once(events, 'delay-changed')
      const job = await harness.add(IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB, {
        importId: submitted.import.id,
        rowId,
      })
      const [event] = await delayed
      expect(event).toMatchObject({ jobId: job.id })
      const stored = await harness.queue.getJob(job.id)
      expect(await stored?.getState()).toBe('delayed')
      expect(stored?.attemptsMade).toBe(0)
      expect((await getRssFeedImport(user.id, submitted.import.id))?.import.pending_rows).toBe(1)

      release.resolve()
      await holder
      expect(await harness.settled(job)).toBe('completed')
      expect((await getRssFeedImport(user.id, submitted.import.id))?.import).toMatchObject({
        completed_rows: 0,
        failed_rows: 1,
        pending_rows: 0,
      })
    } finally {
      release.resolve()
      await holder
      await Promise.all([events.close(), harness.close()])
    }
  })
})
