import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  type UserRssFeedImportRowData,
} from '@queues/background/enqueues/imports-jobs'
import { USER_RSS_FEED_IMPORT_DISPATCH_ID_PREFIX } from '@queues/user-rss-feed-imports/config'
import { userImportExportConfig } from '@services/user-import-export/config'
import { dispatchUserRssFeedImport } from '@services/user-import-export/rss-feed-import-dispatch'
import { recoverStalledUserRssFeedImports } from '@services/user-import-export/rss-feed-import-recovery'
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

describe('import recovery on a real shared queue', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('re-dispatches an import whose dispatcher failed every attempt, once', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_dispatch_page_size: 2 }),
    )
    const user = await createTestUser()
    const stamp = crypto.randomUUID()
    const submitted = await submitRssFeedImport(
      user,
      WEB_PROVENANCE,
      Array.from({ length: 3 }, (_, index) => `https://recover-${stamp}-${index}.example.com/rss`),
    )
    const importId = submitted.import.id
    const rowIds = await getRssFeedImportRowIds(importId)
    const started: string[] = []
    const allRowsRan = Promise.withResolvers<void>()
    let dispatcherBroken = true

    // The production dispatcher pages the rows; only where its jobs go is swapped, onto the
    // isolated queue this harness runs.
    const dispatchOnHarness = (data: { importId: string; cursor?: number }) =>
      dispatchUserRssFeedImport(data, {
        enqueueRows: async rows => {
          const added = []
          for (const row of rows)
            added.push(await harness!.add(IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB, row))
          return added
        },
        enqueueContinuation: async (id, cursor) => {
          await harness!.add(
            IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
            { importId: id, cursor },
            { jobId: `recover_${id}_${cursor}`, removeOnComplete: true },
          )
          return undefined
        },
      })
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name]: job => {
          if (dispatcherBroken) throw new Error('postgres is down')
          return dispatchOnHarness(job.data as { importId: string; cursor?: number })
        },
        [IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name]: job => {
          started.push((job.data as UserRssFeedImportRowData).rowId)
          if (started.length === rowIds.length) allRowsRan.resolve()
        },
      },
    })
    const dispatchJobId = `${USER_RSS_FEED_IMPORT_DISPATCH_ID_PREFIX}__${importId}__start`
    const enqueued: string[] = []
    const enqueueDispatch = async (id: string) => {
      // The shared database may hold other tests' unfinished imports; only this one is dispatched.
      if (id !== importId) return undefined
      enqueued.push(id)
      await harness!.add(
        IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
        { importId: id },
        { jobId: dispatchJobId, removeOnComplete: true, removeOnFail: true },
      )
      return undefined
    }

    // The dispatcher fails its only attempt and is removed, as after its last retry.
    const failing = await harness.add(
      IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
      { importId },
      { jobId: dispatchJobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
    )
    await expect(harness.settled(failing)).resolves.toBe('failed')
    expect(started).toEqual([])

    dispatcherBroken = false
    // A sweep takes a bounded number of imports, oldest first; repeating it reaches this one
    // however many unfinished imports the shared database holds.
    while (enqueued.length === 0) {
      await recoverStalledUserRssFeedImports({ staleAfterMs: 0, enqueueDispatch })
    }
    await allRowsRan.promise

    expect(enqueued).toEqual([importId])
    expect(started.toSorted()).toEqual(rowIds.toSorted())

    // The sweep marked the import as just touched, so the next one leaves it alone.
    await recoverStalledUserRssFeedImports({ enqueueDispatch })
    expect(enqueued).toEqual([importId])
  })
})
