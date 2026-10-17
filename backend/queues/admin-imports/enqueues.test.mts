import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB } from '@queues/background/enqueues/imports-jobs'
import { getEnqueuedJobId, readEnqueuedJob } from '@voucha/test-helpers/queue-jobs'
import {
  enqueueAdminTopicImportDispatch,
  enqueueAdminTopicImportDispatchContinuation,
} from './enqueues.mts'
import { adminImports } from './queues.mts'

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

  it('puts the dispatcher on the shared background queue at priority 100', async () => {
    const job = await readEnqueuedJob(
      adminImports,
      await enqueueAdminTopicImportDispatch(randomUUID()),
    )

    expect(job.name).toBe(IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB.name)
    expect(job.opts.priority).toBe(100)
  })

  it('ranks dispatchers behind the rows they enqueue', () => {
    expect(IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB.options.priority).toBe(100)
  })
})
