import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB } from '@queues/background/enqueues/imports-jobs'
import { getEnqueuedJobId, readEnqueuedJob } from '@voucha/test-helpers/queue-jobs'
import {
  enqueueUserRssFeedImportDispatch,
  enqueueUserRssFeedImportDispatchContinuation,
} from './enqueues.mts'
import { userRssFeedImports } from './queues.mts'

describe('user RSS feed import dispatcher ids', () => {
  it('gives every page of an import its own job id, so a page can continue while it runs', async () => {
    const importId = randomUUID()

    const ids = [
      getEnqueuedJobId(await enqueueUserRssFeedImportDispatch(importId)),
      getEnqueuedJobId(await enqueueUserRssFeedImportDispatchContinuation(importId, 99)),
      getEnqueuedJobId(await enqueueUserRssFeedImportDispatchContinuation(importId, 199)),
    ]

    expect(new Set(ids).size).toBe(3)
    for (const id of ids) {
      expect(id).toContain(importId)
      expect(id).not.toMatch(/[:{}]/)
    }
  })

  it('puts the dispatcher on the shared background queue at priority 100', async () => {
    const job = await readEnqueuedJob(
      userRssFeedImports,
      await enqueueUserRssFeedImportDispatch(randomUUID()),
    )

    expect(job.name).toBe(IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name)
    expect(job.opts.priority).toBe(100)
  })

  it('collapses a repeated page into the one job already claiming its id', async () => {
    const importId = randomUUID()

    await enqueueUserRssFeedImportDispatchContinuation(importId, 5)

    await expect(enqueueUserRssFeedImportDispatchContinuation(importId, 5)).resolves.toBeNull()
  })

  it('ranks dispatchers behind the rows they enqueue', () => {
    expect(IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.options.priority).toBe(100)
  })
})
