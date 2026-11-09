import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { insertTestUrl, insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { hackerNewsQueue } from '@queues/hacker-news/queues'
import { observeTestPostgresQueryPools } from '@voucha/test-helpers'
import { enqueueMissingHackerNewsLookups } from './hacker-news-lookup-enqueue.mts'
import {
  getHackerNewsLookupTargets,
  getHackerNewsRefreshDelay,
  isHackerNewsLookupDue,
} from './hacker-news-lookup-state.mts'
import { replaceHackerNewsReferences } from './hacker-news-references-write.mts'
import { getRssFeedItemHackerNewsSummaries } from './hacker-news-sidecars.mts'

// Exercise canonical-root admission through the real URL store and queue boundary.
describe('Hacker News lookup state', () => {
  it('keeps ordinary missing-detail admission on the replica', async () => {
    const row = await insertTestUrlDirect(
      null,
      `https://detail-${randomUUID()}.example.com/article`,
    )
    if (!row) throw new Error('Expected a URL fixture')
    const jobId = `hacker-news__${row.id}`
    onTestFinished(async () => {
      await (await hackerNewsQueue.getJob(jobId))?.remove()
    })

    const observation = await observeTestPostgresQueryPools(
      '/* getHackerNewsLookupTargets */',
      () => enqueueMissingHackerNewsLookups([row.id]),
    )

    expect(observation.pools).toEqual(['read'])
    expect((await hackerNewsQueue.getJob(jobId))?.data).toEqual({ urlId: row.id })
  })

  it('deduplicates aliases at their terminal, admits it once, and skips a completed zero-hit lookup', async () => {
    const suffix = randomUUID()
    const canonical = await insertTestUrlDirect(null, `https://example.com/${suffix}/canonical`)
    if (!canonical) throw new Error('Expected a canonical URL fixture')
    const middle = await insertTestUrl({
      url: `https://example.com/${suffix}/middle`,
      hostnameId: canonical.hostname.id,
      canonicalUrlId: canonical.id,
    })
    const alias = await insertTestUrl({
      url: `https://example.com/${suffix}/alias`,
      hostnameId: canonical.hostname.id,
      canonicalUrlId: canonical.id,
    })
    const urls = [alias, middle, canonical.id, alias]
    expect((await getHackerNewsLookupTargets(urls)).map(target => target.id)).toEqual([
      canonical.id,
    ])
    await enqueueMissingHackerNewsLookups(urls)
    const job = await hackerNewsQueue.getJob(`hacker-news__${canonical.id}`)
    expect(job?.data).toEqual({ urlId: canonical.id })
    expect(await hackerNewsQueue.getJob(`hacker-news__${alias}`)).toBeFalsy()
    await job?.remove()
    await replaceHackerNewsReferences([
      { urlId: canonical.id, stories: [], comments: [], storyCount: 0, commentCount: 0 },
    ])
    await enqueueMissingHackerNewsLookups(urls)
    expect(await hackerNewsQueue.getJob(`hacker-news__${canonical.id}`)).toBeFalsy()
  })

  it('does not enqueue from list summaries and never admits bare-domain lookups', async () => {
    const id = randomUUID()
    const row = await insertTestUrlDirect(null, `https://example.com/${id}`)
    const bare = await insertTestUrlDirect(null, `https://${id}.example.com/`)
    if (!row || !bare) throw new Error('Expected URL fixtures')
    await getRssFeedItemHackerNewsSummaries([{ id, url: { id: row.id } }])
    expect(await hackerNewsQueue.getJob(`hacker-news__${row.id}`)).toBeFalsy()
    await enqueueMissingHackerNewsLookups([bare.id])
    expect(await hackerNewsQueue.getJob(`hacker-news__${bare.id}`)).toBeFalsy()
  })

  it('uses slower refreshes as URLs age and ends automatic refresh after retention', () => {
    const now = Date.parse('2026-11-01T00:00:00Z')
    const target = {
      id: 'url',
      url: 'https://example.com/article',
      created_at: new Date(now),
      looked_up_at: new Date(now - 24 * 3_600_000),
    }
    const daily = getHackerNewsRefreshDelay(target, now)
    const week = getHackerNewsRefreshDelay(
      { ...target, created_at: new Date(now - 10 * 86_400_000) },
      now,
    )
    const month = getHackerNewsRefreshDelay(
      { ...target, created_at: new Date(now - 40 * 86_400_000) },
      now,
    )
    expect(daily).toBeLessThan(week!)
    expect(week).toBeLessThan(month!)
    expect(isHackerNewsLookupDue(target, now)).toBe(true)
    expect(
      isHackerNewsLookupDue({ ...target, created_at: new Date(now - 10 * 86_400_000) }, now),
    ).toBe(false)
    expect(
      getHackerNewsRefreshDelay({ ...target, created_at: new Date(now - 181 * 86_400_000) }, now),
    ).toBeNull()
  })
})
