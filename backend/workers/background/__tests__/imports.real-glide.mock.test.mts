import { createRssFeedImportBatchForTest } from '@voucha/test-helpers/rss-feed-import-batches'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { background } from '@queues/background/queues'
import {
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  type UserRssFeedImportRowData,
} from '@queues/background/enqueues/imports-jobs'
import { userImportExportConfig } from '@services/user-import-export/config'
import { dispatchUserRssFeedImport } from '@services/user-import-export/rss-feed-import-dispatch'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getRssFeedImportRowIds } from '@voucha/test-helpers/rss-feed-import-rows'
import { createBackgroundProcessor } from '../processors.mts'

// A random Valkey database gives this file a private `voucha_qdb_<n>` queue namespace.
vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

async function submitImport(rowCount: number): Promise<{ importId: string; rowIds: string[] }> {
  const user = await createTestUser()
  const stamp = crypto.randomUUID()
  const submitted = await createRssFeedImportBatchForTest(
    user,
    WEB_PROVENANCE,
    Array.from(
      { length: rowCount },
      (_, index) => `https://turns-${stamp}-${index}.example.com/rss`,
    ),
  )
  return {
    importId: submitted.import.id,
    rowIds: await getRssFeedImportRowIds(submitted.import.id),
  }
}

describe('imports domain on a real shared queue', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
    await closeAndUnregisterGlideMQInstance(background)
  })

  it('lets a small import finish without waiting for a large one to drain', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_dispatch_page_size: 2 }),
    )
    const large = await submitImport(6)
    const small = await submitImport(1)
    const started: string[] = []
    const allRowsRan = Promise.withResolvers<void>()

    // The production dispatcher pages the rows onto the production `background` queue, which this
    // file's private Valkey namespace gives to the harness's one worker slot, so the order is the
    // queue's own.
    harness = await startBackgroundHarness({
      connection,
      queueName: BACKGROUND_QUEUE_NAME,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name]: job =>
          dispatchUserRssFeedImport(job.data as { importId: string; cursor?: number }),
        [IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name]: job => {
          started.push((job.data as UserRssFeedImportRowData).rowId)
          if (started.length === 7) allRowsRan.resolve()
        },
      },
    })

    await harness.add(IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB, { importId: large.importId })
    await harness.add(IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB, { importId: small.importId })
    await allRowsRan.promise

    // The large import's last page only reaches the queue after the small import's row did.
    const lastPage = large.rowIds.slice(4)
    for (const rowId of lastPage) {
      expect(started.indexOf(small.rowIds[0]!)).toBeLessThan(started.indexOf(rowId))
    }
    expect(started.toSorted()).toEqual([...large.rowIds, ...small.rowIds].toSorted())
  })
})
