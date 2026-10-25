import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  type UserRssFeedImportRowData,
} from '@queues/background/enqueues/imports-jobs'
import { userImportExportConfig } from '@services/user-import-export/config'
import { dispatchUserRssFeedImport } from '@services/user-import-export/rss-feed-import-dispatch'
import { submitRssFeedImport } from '@services/user-import-export/rss-feed-imports'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getRssFeedImportRowIds } from '@voucha/test-helpers/rss-feed-import-rows'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

async function submitImport(rowCount: number): Promise<{ importId: string; rowIds: string[] }> {
  const user = await createTestUser()
  const stamp = crypto.randomUUID()
  const submitted = await submitRssFeedImport(
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
  })

  it('lets a small import finish without waiting for a large one to drain', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_dispatch_page_size: 2 }),
    )
    const large = await submitImport(6)
    const small = await submitImport(1)
    const started: string[] = []
    const allRowsRan = Promise.withResolvers<void>()

    // The production dispatcher pages the rows; only where its jobs go is swapped, onto the
    // isolated queue this harness runs. One worker slot makes the order the queue's own.
    const dispatchOnHarness = (data: { importId: string; cursor?: number }) =>
      dispatchUserRssFeedImport(data, {
        enqueueRows: async rows => {
          const added = []
          for (const row of rows)
            added.push(await harness!.add(IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB, row))
          return added
        },
        enqueueContinuation: async (importId, cursor) => {
          await harness!.add(
            IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
            { importId, cursor },
            { jobId: `turns_${importId}_${cursor}`, removeOnComplete: true },
          )
          return undefined
        },
      })
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name]: job =>
          dispatchOnHarness(job.data as { importId: string; cursor?: number }),
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
