import { randomUUID } from 'node:crypto'
import type { Job, Worker } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  enqueueHackerNewsLookupRefreshes,
  enqueueHackerNewsLookups,
} from '@queues/hacker-news/enqueues'
import { hackerNewsQueue } from '@queues/hacker-news/queues'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { getHackerNewsSummariesByEntity } from '@services/urls/hacker-news-references'
import { hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { enqueueHeartbeat } from '@queues/heartbeat/enqueues'
import { heartbeat as heartbeatQueue } from '@queues/heartbeat/queues'
import {
  getHackerNewsItemsByUrlIds,
  getHackerNewsTotalsByUrlIds,
} from '@services/urls/hacker-news-references-read'
import { hardDeleteTestUrl, insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
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
  // no-mistakes-timeout-reason: Delayed promotion, global queue limiting, and provider pacing.
  it('drops queued work while pulling is disabled and resumes admissions after it is enabled', async () => {
    await hackerNewsQueueConfig.waitForInitialization()
    expect(hackerNewsQueueConfig.defaultFields.lookups_enabled).toBe(true)
    const row = await insertFreshRecordingUrl()
    if (!row) throw new Error('Expected a test URL')
    const neverAdmitted = randomUUID()
    const runAt = new Date(Date.now() + 2500).toISOString()
    const refreshId = `hacker-news-refresh__${row.id}__${Buffer.from(runAt).toString('base64url')}`
    const noRefreshId = `hacker-news-refresh__${neverAdmitted}__${Buffer.from(runAt).toString('base64url')}`
    const agent = new MockAgent()
    agent.disableNetConnect()
    const pool = agent.get('https://hn.algolia.com')
    for (const [kind, response] of Object.entries(recording.responses)) {
      const tag = kind === 'stories' ? 'story' : 'comment'
      pool
        .intercept({
          method: 'GET',
          path(path) {
            const request = new URL(path, recording.provider)
            return (
              request.pathname === '/api/v1/search' &&
              request.searchParams.get('query') === recording.search_query &&
              request.searchParams.get('tags') === tag
            )
          },
        })
        .reply(200, JSON.stringify(response))
    }
    let restore = () => {}
    try {
      await withMockAgentDefaultFetchForTest(agent, async () => {
        const pending = completion(hackerNews, refreshId)
        await enqueueHackerNewsLookupRefreshes([{ urlId: row.id, runAt }])
        expect(await hackerNewsQueue.getJob(refreshId)).not.toBeNull()
        restore = overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, {
          lookups_enabled: false,
        })
        await enqueueHackerNewsLookups([neverAdmitted])
        await enqueueHackerNewsLookupRefreshes([{ urlId: neverAdmitted, runAt }])
        expect(await hackerNewsQueue.getJob(`hacker-news__${neverAdmitted}`)).toBeNull()
        expect(await hackerNewsQueue.getJob(noRefreshId)).toBeNull()
        await pending.promise
        pending.stop()
        expect((await getHackerNewsTotalsByUrlIds([row.id])).has(row.id)).toBe(false)
        expect(agent.pendingInterceptors()).toHaveLength(2)
        restore()
        const completed = completion(hackerNews, `hacker-news__${row.id}`)
        await enqueueHackerNewsLookups([row.id])
        await completed.promise
        completed.stop()
        agent.assertNoPendingInterceptors()
        expect((await getHackerNewsTotalsByUrlIds([row.id])).has(row.id)).toBe(true)
      })
    } finally {
      restore()
      const jobs = await hackerNewsQueue.searchJobs({ data: { urlId: row.id } })
      await Promise.all(jobs.map(job => job.remove()))
      await agent.close()
    }
  }, 15_000)
  // no-mistakes-timeout-reason: Two queue jobs share global limiting and provider pacing.
  it('persists a lookup, skips a fresh duplicate, and leaves other queues free while refreshes wait', async () => {
    const identity = recording.search_query
    const row = await insertFreshRecordingUrl()
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
    const restoreVisibility = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: false,
    })
    try {
      await withMockAgentDefaultFetchForTest(agent, async () => {
        const first = completion(hackerNews, jobId)
        await enqueueHackerNewsLookups([row.id, row.id])
        await first.promise
        first.stop()
        agent.assertNoPendingInterceptors()
        const totals = await getHackerNewsTotalsByUrlIds([row.id])
        const items = await getHackerNewsItemsByUrlIds([row.id])
        expect(await getHackerNewsSummariesByEntity({ item: [row.id] })).toEqual({})
        restoreVisibility()
        const restorePull = overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, {
          lookups_enabled: false,
        })
        try {
          expect(await getHackerNewsSummariesByEntity({ item: [row.id] })).toEqual({
            item: { story_count: 8, comment_count: 10 },
          })
        } finally {
          restorePull()
        }
        expect(totals.get(row.id)).toEqual({
          canonical_url_id: row.id,
          story_count: 8,
          comment_count: 10,
        })
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
      restoreVisibility()
      await Promise.all(refreshIds.map(async id => (await hackerNewsQueue.getJob(id))?.remove()))
      const generated = await hackerNewsQueue.searchJobs({ data: { urlId: row.id } })
      await Promise.all(generated.map(job => job.remove()))
      await agent.close()
    }
  }, 15_000)
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
        : new Promise<Job>(resolve => {
            waiting.set(jobId, resolve)
          }),
      `job ${jobId} completion`,
      10_000,
    )
  return {
    promise: id ? forId(id) : Promise.resolve(undefined),
    forId,
    stop: () => worker.off('completed', onCompleted),
  }
}

/** Tracking params collapse into one stored row, so drop earlier lookups and start from a new row. */
async function insertFreshRecordingUrl() {
  const existing = await insertTestUrlDirect(null, recording.query)
  if (existing) await hardDeleteTestUrl(existing.id)
  return insertTestUrlDirect(null, recording.query)
}
