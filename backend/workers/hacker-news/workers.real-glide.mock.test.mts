import { randomUUID } from 'node:crypto'
import type { Job, Worker } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  enqueueHackerNewsLookupRefreshes,
  enqueueHackerNewsLookups,
} from '@queues/hacker-news/enqueues'
import { hackerNewsQueue } from '@queues/hacker-news/queues'
import { enqueueHeartbeat } from '@queues/heartbeat/enqueues'
import { heartbeat as heartbeatQueue } from '@queues/heartbeat/queues'
import {
  getHackerNewsItemsByUrlIds,
  getHackerNewsTotalsByUrlIds,
} from '@services/urls/hacker-news-references-read'
import { insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { MockAgent, withMockAgentDefaultFetchForTest } from '@voucha/test-helpers/provider-http'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { heartbeat } from '@workers/heartbeat/workers'
import recording from '../../services/urls/hacker-news-algolia-recording.json' with { type: 'json' }
import { hackerNews } from './workers.mts'

// Use the actual GlideMQ provider instead of the default in-memory test adapter.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('Hacker News lookup worker', () => {
  afterAll(async () => {
    await Promise.all([
      hackerNews.close(true),
      heartbeat.close(true),
      hackerNewsQueue.close(),
      heartbeatQueue.close(),
    ])
  })
  it('persists a lookup, skips a fresh duplicate, and leaves other queues free while refreshes wait', async () => {
    const identity = recording.search_query
    const url = `${recording.query}?utm_source=${randomUUID()}`
    const row = await insertTestUrlDirect(null, url)
    if (!row) throw new Error('Expected a test URL')
    const agent = new MockAgent()
    agent.disableNetConnect()
    const pool = agent.get('https://hn.algolia.com')
    for (const [kind, response] of Object.entries(recording.responses)) {
      const tag = kind === 'stories' ? 'story' : 'comment'
      const body = JSON.stringify(response)
      pool
        .intercept({
          method: 'GET',
          path(path) {
            const request = new URL(path, recording.provider)
            return (
              request.pathname === '/api/v1/search' &&
              request.searchParams.get('query') === identity &&
              request.searchParams.get('tags') === tag
            )
          },
        })
        .reply(200, body)
    }
    const delayedIds = [randomUUID(), randomUUID()]
    const runAt = new Date(Date.now() + 60_000).toISOString()
    const refreshIds = delayedIds.map(
      id => `hacker-news-refresh__${id}__${Buffer.from(runAt).toString('base64url')}`,
    )
    const jobId = `hacker-news__${row.id}`
    try {
      await withMockAgentDefaultFetchForTest(agent, async () => {
        const first = completion(hackerNews, jobId)
        await enqueueHackerNewsLookups([row.id, row.id])
        await first.promise
        first.stop()
        agent.assertNoPendingInterceptors()
        const totals = await getHackerNewsTotalsByUrlIds([row.id])
        const items = await getHackerNewsItemsByUrlIds([row.id])
        expect(totals.get(row.id)).toEqual({ story_count: 8, comment_count: 10 })
        expect(items.get(row.id)?.stories.map(story => story.hacker_news_item_id)).toContain(
          9353080,
        )

        const duplicate = completion(hackerNews, jobId)
        await enqueueHackerNewsLookups([row.id])
        await duplicate.promise
        duplicate.stop()
        expect(await getHackerNewsTotalsByUrlIds([row.id])).toEqual(totals)

        await enqueueHackerNewsLookupRefreshes(delayedIds.map(urlId => ({ urlId, runAt })))
        const delayed = await Promise.all(refreshIds.map(id => hackerNewsQueue.getJob(id)))
        expect(await Promise.all(delayed.map(async job => job?.getState()))).toEqual([
          'delayed',
          'delayed',
        ])
        const done = completion(heartbeat)
        const other = await enqueueHeartbeat()
        if (!other) throw new Error('Expected a heartbeat job')
        await done.forId(other.id)
        done.stop()
        expect(await Promise.all(delayed.map(async job => job?.getState()))).toEqual([
          'delayed',
          'delayed',
        ])
      })
    } finally {
      await Promise.all(refreshIds.map(async id => (await hackerNewsQueue.getJob(id))?.remove()))
      const generated = await hackerNewsQueue.searchJobs({ data: { urlId: row.id } })
      await Promise.all(generated.map(job => job.remove()))
      await agent.close()
    }
  })
})

function completion(worker: Worker, id?: string) {
  const seen = new Map<string, Job>()
  const waiting = new Map<string, (job: Job) => void>()
  const onCompleted = (job: Job) => {
    const resolve = waiting.get(job.id)
    if (resolve) {
      waiting.delete(job.id)
      resolve(job)
    } else seen.set(job.id, job)
  }
  worker.on('completed', onCompleted)
  const forId = (jobId: string) =>
    waitForRealGlideEvent(
      seen.has(jobId)
        ? Promise.resolve(seen.get(jobId)!)
        : new Promise<Job>(resolve => waiting.set(jobId, resolve)),
      `job ${jobId} completion`,
      10_000,
    )
  return {
    promise: id ? forId(id) : Promise.resolve(undefined),
    forId,
    stop: () => worker.off('completed', onCompleted),
  }
}
