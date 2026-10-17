import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB } from '@queues/background/enqueues/imports-jobs'
import { getEnqueuedJobId } from '@voucha/test-helpers/queue-jobs'
import {
  enqueueAdminTopicImportDispatch,
  enqueueAdminTopicImportDispatchContinuation,
} from './enqueues.mts'

describe('admin topic import dispatcher ids', () => {
  it('gives every page of a batch its own job id, so a page can continue while it runs', async () => {
    const batchId = randomUUID()

    const ids = [
      getEnqueuedJobId(await enqueueAdminTopicImportDispatch(batchId)),
      getEnqueuedJobId(await enqueueAdminTopicImportDispatchContinuation(batchId, 99)),
      getEnqueuedJobId(await enqueueAdminTopicImportDispatchContinuation(batchId, 199)),
    ]

    expect(new Set(ids).size).toBe(3)
    for (const id of ids) {
      expect(id).toContain(batchId)
      expect(id).not.toMatch(/[:{}]/)
    }
  })

  it('ranks dispatchers behind the rows they enqueue', () => {
    expect(IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB.options.priority).toBe(100)
  })
})
