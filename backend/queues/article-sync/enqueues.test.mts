import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueArticleSync } from './enqueues.mts'
import { articleSync } from './queues.mts'

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the
// emitted job's data and deduplication options, instead of mocking the enqueue factory.
describe('enqueueArticleSync', () => {
  it('enqueues a processArticleSync job with the userId and singleton throttle dedup', async () => {
    const userId = `user-${randomUUID()}`

    await enqueueArticleSync(userId)

    const jobs = await readAllQueueJobs(articleSync)
    const job = jobs.find(j => (j.data as { userId?: string }).userId === userId)
    expect(job).toBeDefined()
    expect(job!.data).toEqual({ userId })
    expect(job!.opts).toMatchObject({
      priority: 10,
      deduplication: { id: 'article-sync-singleton', mode: 'throttle' },
    })
  })
})
