import { afterAll, afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { adminImportsWorkConfig } from '@queues/admin-imports/config'
import { enqueueAdminTopicImportDispatch } from '@queues/admin-imports/enqueues'
import {
  IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB,
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  IMPORTS_RECOVER_STALLED_JOB,
  type AdminTopicImportRowData,
  type UserRssFeedImportRowData,
} from '@queues/background/enqueues/imports-jobs'
import type { BackgroundHandler } from '@queues/background/types'
import { enqueueUserRssFeedImportDispatch } from '@queues/user-rss-feed-imports/enqueues'
import { createImportBatch } from '@services/admin-imports/create-batch'
import { dispatchAdminTopicImport } from '@services/admin-imports/dispatch-batch'
import { userImportExportConfig } from '@services/user-import-export/config'
import { dispatchUserRssFeedImport } from '@services/user-import-export/rss-feed-import-dispatch'
import { updateRssFeedImportRowFailed } from '@services/user-import-export/rss-feed-import-row-updates'
import { submitRssFeedImport } from '@services/user-import-export/rss-feed-imports'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { getRssFeedImportRowIds } from '@voucha/test-helpers/rss-feed-import-rows'
import { adminImportsHandlers } from '../../admin-imports/workers.mts'
import { userRssFeedImportsHandlers } from '../../user-rss-feed-imports/workers.mts'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

// Only the dispatchers are real; a row job records its id instead of fetching a feed.
const userRows: string[] = []
const adminRows: string[] = []
let rowSeen: (() => void) | undefined

function recordRow(into: string[]) {
  return (queued: { data: { rowId: string } }) => {
    into.push(queued.data.rowId)
    rowSeen?.()
  }
}

const importHandlers: BackgroundHandler[] = [
  ...adminImportsHandlers.filter(
    handler => handler.job.name === IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB.name,
  ),
  ...userRssFeedImportsHandlers.filter(
    handler => handler.job.name === IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name,
  ),
  // The sweep has its own tests; here it only has to be a registered job.
  { job: IMPORTS_RECOVER_STALLED_JOB, handle: () => undefined },
  {
    job: IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB,
    handle: recordRow(adminRows) as BackgroundHandler<AdminTopicImportRowData>['handle'],
  },
  {
    job: IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
    handle: recordRow(userRows) as BackgroundHandler<UserRssFeedImportRowData>['handle'],
  },
]

const worker = createBackgroundWorker({
  handlers: [
    ...BACKGROUND_HANDLERS.filter(handler => handler.job.domain !== 'imports'),
    ...importHandlers,
  ],
  domains: ['imports'],
})

/** Resolves once `rows` holds `count` entries; each row job's own event wakes it. */
function untilRows(rows: string[], count: number): Promise<void> {
  const reached = Promise.withResolvers<void>()
  const check = () => {
    if (rows.length >= count) reached.resolve()
  }
  rowSeen = check
  check()
  return reached.promise
}

describe('imports background domain', () => {
  afterEach(() => {
    userRows.length = 0
    adminRows.length = 0
    rowSeen = undefined
    deleteDynamicConfigFieldsForTest(userImportExportConfig, ['import_dispatch_page_size'])
    deleteDynamicConfigFieldsForTest(adminImportsWorkConfig, ['dispatch_page_size'])
  })

  afterAll(async () => {
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('pages a user import onto the queue exactly once, and a second run enqueues nothing', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_dispatch_page_size: 2 }),
    )
    const user = await createTestUser()
    const stamp = Date.now()
    const submitted = await submitRssFeedImport(
      user,
      WEB_PROVENANCE,
      Array.from({ length: 5 }, (_, index) => `https://paged-${stamp}-${index}.example.com/rss`),
    )
    const rowIds = await getRssFeedImportRowIds(submitted.import.id)

    const done = untilRows(userRows, rowIds.length)
    await enqueueUserRssFeedImportDispatch(submitted.import.id)
    await done

    expect(userRows.toSorted()).toEqual(rowIds.toSorted())
    // Five rows at two per page took three dispatcher pages; each row was enqueued exactly once.
    expect(userRows).toHaveLength(rowIds.length)

    // Once every row has finished nothing is pending, so a repeated run adds no row job.
    await Promise.all(
      rowIds.map(rowId => updateRssFeedImportRowFailed(rowId, 'done', { isFinalAttempt: true })),
    )
    const enqueued: UserRssFeedImportRowData[][] = []
    await dispatchUserRssFeedImport(
      { importId: submitted.import.id },
      {
        enqueueRows: rows => {
          enqueued.push(rows)
          return Promise.resolve([])
        },
      },
    )
    expect(enqueued).toEqual([])
  })

  it('pages an admin topic import onto the queue exactly once, and a second run enqueues nothing', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(adminImportsWorkConfig, { dispatch_page_size: 2 }),
    )
    const admin = await createTestUser({ administrator: true })
    const stamp = Date.now()
    const { batch, rows } = await createImportBatch(
      admin,
      'topic',
      Array.from({ length: 5 }, (_, index) => ({ slug: `paged-topic-${stamp}-${index}` })),
    )

    const done = untilRows(adminRows, rows.length)
    await enqueueAdminTopicImportDispatch(batch.id)
    await done

    expect(adminRows.toSorted()).toEqual(rows.map(row => row.id).toSorted())

    const enqueued: AdminTopicImportRowData[][] = []
    await dispatchAdminTopicImport(
      { batchId: batch.id, cursor: rows.length },
      {
        enqueueRows: batchRows => {
          enqueued.push(batchRows)
          return Promise.resolve([])
        },
      },
    )
    expect(enqueued).toEqual([])
  })
})
