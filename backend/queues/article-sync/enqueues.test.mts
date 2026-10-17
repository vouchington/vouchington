import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueArticleSync } from './enqueues.mts'
import { articleSync } from './queues.mts'

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the
// emitted job's data and deduplication options, instead of mocking the enqueue factory.
describe('enqueueArticleSync', () => {
  it('enqueues an article-sync.processArticleSync job with the userId, the domain ordering group and the singleton throttle dedup', async () => {
    const userId = `user-${randomUUID()}`

    await enqueueArticleSync(userId)

    const jobs = await readAllQueueJobs(articleSync)
    const job = jobs.find(j => (j.data as { userId?: string }).userId === userId)
    expect(job).toBeDefined()
    expect(job!.data).toEqual({ userId })
    expect(job!.name).toBe('article-sync.processArticleSync')
    expect(job!.opts).toMatchObject({
      priority: 10,
      lockDuration: 120_000,
      ordering: { key: 'article-sync', concurrency: 1 },
      deduplication: { id: 'article-sync-singleton', mode: 'throttle' },
    })
  })
})
