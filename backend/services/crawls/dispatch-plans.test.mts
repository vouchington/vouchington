import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createTestUser,
  createTestPost,
  insertTestUrlDirect,
  insertTestPostRelatedUrlBatch,
  deleteTestRobotsTxtCache,
  setTestRobotsTxtCache,
} from '@voucha/test-helpers'
import { insertTestCrawlDispatchPlanUrls } from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import { crawlDispatchConfig } from './work-limits.mts'
import { dispatchCrawlUrlsPerHostname } from './dispatch-per-hostname.mts'
import { dispatchTier1CrawlUrls, dispatchTier2CrawlUrls } from './dispatch-tier-urls.mts'

function ownedUrlWindow(size: number) {
  const historicalRangeMs = Date.UTC(2021, 0, 1) - Date.UTC(1971, 0, 1)
  const time = new Date(
    Date.UTC(1971, 0, 1) +
      Number(
        BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 12)}`) % BigInt(historicalRangeMs),
      ),
  )
  const upperId = getMaxUUIDv7ForDate(time)
  const upper = BigInt(`0x${upperId.replaceAll('-', '')}`)
  const idAtOffset = (offset: number) => {
    const hex = (upper - BigInt(offset)).toString(16).padStart(32, '0')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return {
    ids: Array.from({ length: size }, (_, index) => idAtOffset(size - index - 1)),
    cursor: {
      sweepStartedAt: new Date(time.getTime() + 1).toISOString(),
      afterId: idAtOffset(size),
    },
  }
}

describe('crawl dispatch indexed work selection', () => {
  it('saves the initial tier checkpoint before querying when no cursor is supplied', async () => {
    const initialTime = new Date('2026-01-02T03:04:05.678Z')
    const checkpointError = new Error('stop after saving initial crawl cursor')
    onTestFinished(() => {
      vi.useRealTimers()
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(initialTime)

    try {
      const captured = await withCapturedTestQueries(async () => {
        await expect(
          dispatchTier1CrawlUrls(undefined, async cursor => {
            expect(cursor).toEqual({ sweepStartedAt: initialTime.toISOString() })
            throw checkpointError
          }),
        ).rejects.toBe(checkpointError)
      })
      expect(captured.queries).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses hostname selection and relation-driven URL probes among unrelated URLs', async () => {
    const actor = await createTestUser()
    const suffix = randomUUID()
    const hostname = `crawl-plan-${suffix}.example.com`
    const unrelatedHostname = `unrelated-${suffix}.example.com`
    const window = ownedUrlWindow(9)
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    await setTestRobotsTxtCache(unrelatedHostname, 'User-agent: *\nAllow: /')
    onTestFinished(() => deleteTestRobotsTxtCache(hostname, unrelatedHostname))
    const target = (await insertTestUrlDirect(actor.id, `https://${hostname}/base`, {
      id: window.ids[0]!,
    }))!
    await updateUrlHostname(target.hostname.id, { is_crawlable: true })
    const unrelated = (await insertTestUrlDirect(actor.id, `https://${unrelatedHostname}/base`, {
      id: window.ids[1]!,
    }))!
    await insertTestCrawlDispatchPlanUrls({
      ids: window.ids.slice(2, 5),
      hostname: unrelated.hostname.hostname,
      hostnameId: unrelated.hostname.id,
      actorId: actor.id,
    })
    const post = await createTestPost({ user: actor })
    const eligibleIds = window.ids.slice(5, 7)
    await insertTestPostRelatedUrlBatch({
      postIds: eligibleIds.map(() => post.id),
      urlIds: eligibleIds,
      hostname,
      hostnameId: target.hostname.id,
      createdById: actor.id,
    })
    const tier2Ids = window.ids.slice(7, 9)
    await insertTestPostRelatedUrlBatch({
      postIds: tier2Ids.map(() => post.id),
      urlIds: tier2Ids,
      hostname,
      hostnameId: target.hostname.id,
      createdById: actor.id,
      votesScoreUp: 0,
    })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
        batch_size: 1,
        max_rows_per_run: 1,
      }),
    )
    const captured = await withCapturedTestQueries(async () => ({
      hostname: await dispatchCrawlUrlsPerHostname(target.hostname.id, window.cursor),
      tier1: await dispatchTier1CrawlUrls(window.cursor),
      tier2: await dispatchTier2CrawlUrls(window.cursor),
    }))
    expect(captured.result.hostname.count).toBe(1)
    expect(captured.result.tier1.count).toBe(1)
    expect(captured.result.tier2.count).toBe(1)
    expect(
      captured.queries.some(query => query.text.startsWith('/* dispatchCrawlUrlsPerHostname */')),
    ).toBe(true)
    expect(
      captured.queries.filter(query => query.text.startsWith('/* dispatchTierCrawlUrls */')),
    ).toHaveLength(2)
  })
})
