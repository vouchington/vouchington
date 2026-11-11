import { randomUUID } from 'node:crypto'
import {
  createStaleRssFeedImportBatchForTest,
  deleteStaleRssFeedImportBatchForTest,
} from '@voucha/test-helpers/rss-feed-import-batches'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { background } from '@queues/background/queues'
import {
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  type UserRssFeedImportRowData,
} from '@queues/background/enqueues/imports-jobs'
import { USER_RSS_FEED_IMPORT_DISPATCH_ID_PREFIX } from '@queues/user-rss-feed-imports/config'
import { userImportExportConfig } from '@services/user-import-export/config'
import { dispatchUserRssFeedImport } from '@services/user-import-export/rss-feed-import-dispatch'
import { recoverStalledUserRssFeedImports } from '@services/user-import-export/rss-feed-import-recovery'
import { createRssFeedImport } from '@services/user-import-export/rss-feed-import-records'
import { updateRssFeedImportRowFailed } from '@services/user-import-export/rss-feed-import-row-updates'
import { getRssFeedImportSummary } from '@services/user-import-export/rss-feed-import-status'
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
const callsFor = (enqueue: ReturnType<typeof vi.fn>, id: string) =>
  enqueue.mock.calls.filter(([called]) => (called as string[]).includes(id)).length

describe('import recovery on a real shared queue', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
    await closeAndUnregisterGlideMQInstance(background)
  })

  it('re-dispatches an import whose dispatcher failed every attempt, once', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_dispatch_page_size: 2 }),
    )
    const user = await createTestUser()
    const stamp = crypto.randomUUID()
    const importId = await createStaleRssFeedImportBatchForTest(
      user.id,
      Array.from({ length: 3 }, (_, index) => `https://recover-${stamp}-${index}.example.com/rss`),
    )
    onTestFinished(() => deleteStaleRssFeedImportBatchForTest(user.id, importId))
    const rowIds = await getRssFeedImportRowIds(importId)
    const started: string[] = []
    const allRowsRan = Promise.withResolvers<void>()
    let dispatcherBroken = true

    // The production dispatcher pages the rows onto the production `background` queue, which this
    // file's private Valkey namespace gives to the harness's worker.
    harness = await startBackgroundHarness({
      connection,
      queueName: BACKGROUND_QUEUE_NAME,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name]: job => {
          if (dispatcherBroken) throw new Error('postgres is down')
          return dispatchUserRssFeedImport(job.data as { importId: string; cursor?: number })
        },
        [IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name]: job => {
          started.push((job.data as UserRssFeedImportRowData).rowId)
          if (started.length === rowIds.length) allRowsRan.resolve()
        },
      },
    })
    const dispatchJobId = `${USER_RSS_FEED_IMPORT_DISPATCH_ID_PREFIX}__${importId}__start`
    const added: string[] = []
    // The production release of a start id held by a finished record, over this harness's queue.
    const enqueueDispatches = (ids: string[]) =>
      enqueueBulkReactivatingFinished({
        queue: harness!.queue,
        // The shared database may hold other tests' unfinished imports; only this one is dispatched.
        inputs: ids.filter(id => id === importId),
        jobIdOf: () => dispatchJobId,
        enqueueBulk: async inputs => {
          const jobs = []
          for (const id of inputs) {
            // The add is skipped, returning no job, while a record still holds the id.
            const job = await harness!.queue.add(
              IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name,
              { importId: id },
              {
                ...IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.options,
                jobId: dispatchJobId,
                removeOnComplete: true,
                removeOnFail: true,
              },
            )
            if (job) {
              added.push(id)
              jobs.push(job)
            }
          }
          return jobs
        },
      })

    // The dispatcher fails its only attempt and, like one that stalled past its limit, leaves its
    // failed record holding the job id.
    const failing = await harness.add(
      IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
      { importId },
      { jobId: dispatchJobId, attempts: 1, removeOnComplete: true, removeOnFail: false },
    )
    await expect(harness.settled(failing)).resolves.toBe('failed')
    expect(started).toEqual([])

    dispatcherBroken = false
    await recoverStalledUserRssFeedImports({ staleAfterMs: 1, enqueueDispatches })
    await allRowsRan.promise

    expect(added).toEqual([importId])
    expect(started.toSorted()).toEqual(rowIds.toSorted())

    // The sweep marked the import as just touched, so the next one leaves it alone.
    await recoverStalledUserRssFeedImports({ enqueueDispatches })
    expect(added).toEqual([importId])
  })

  it('re-dispatches a stalled import once, then leaves it alone until it stalls again', async () => {
    const user = await createTestUser()
    const importId = await createStaleRssFeedImportBatchForTest(user.id, [
      `https://recover-${randomUUID()}.example.com/feed`,
    ])
    onTestFinished(() => deleteStaleRssFeedImportBatchForTest(user.id, importId))
    const enqueueDispatches = vi.fn<(ids: string[]) => Promise<undefined>>(async () => undefined)

    await recoverStalledUserRssFeedImports({ staleAfterMs: 1, enqueueDispatches })
    await recoverStalledUserRssFeedImports({ enqueueDispatches })

    expect(callsFor(enqueueDispatches, importId)).toBe(1)
  })

  it('does not re-dispatch an import that finished', async () => {
    const user = await createTestUser()
    const created = await createRssFeedImport(
      user.id,
      WEB_PROVENANCE,
      [`https://recover-done-${randomUUID()}.example.com/feed`],
      false,
    )
    const [rowId] = await getRssFeedImportRowIds(created.import.id)
    await updateRssFeedImportRowFailed(rowId!, 'No feed found', { isFinalAttempt: true })
    const enqueueDispatches = vi.fn<(ids: string[]) => Promise<undefined>>(async () => undefined)

    await recoverStalledUserRssFeedImports({ staleAfterMs: 0, enqueueDispatches })

    expect(callsFor(enqueueDispatches, created.import.id)).toBe(0)
  })

  it('fills in a completion marker missed after the final row committed', async () => {
    const user = await createTestUser()
    const importId = await createStaleRssFeedImportBatchForTest(
      user.id,
      [`https://recover-terminal-${randomUUID()}.example.com/feed`],
      true,
    )
    onTestFinished(() => deleteStaleRssFeedImportBatchForTest(user.id, importId))
    const enqueueDispatches = vi.fn<(ids: string[]) => Promise<undefined>>(async () => undefined)

    await recoverStalledUserRssFeedImports({ staleAfterMs: 1, enqueueDispatches })

    expect(await getRssFeedImportSummary(user.id, importId)).toMatchObject({
      failed_rows: 1,
      skipped_rows: 1,
      pending_rows: 0,
      completed_at: expect.any(Date),
    })
    expect(callsFor(enqueueDispatches, importId)).toBe(0)
  })
})
