import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi, onTestFinished } from 'vitest'
import {
  createTestUser,
  createTestPost,
  insertTestUrlDirect,
  insertTestPostRelatedUrlBatch,
  setTestRobotsTxtCache,
} from '@voucha/test-helpers'
import { insertTestCrawlDispatchPlanUrls } from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { mintUUIDv7 } from '@modules/utils'
import { crawlDispatchConfig } from './work-limits.mts'
import { dispatchCrawlUrlsPerHostname } from './dispatch-per-hostname.mts'
import { dispatchTier1CrawlUrls, dispatchTier2CrawlUrls } from './dispatch-tier-urls.mts'

const fetch = vi.hoisted(() => vi.fn<typeof import('@modules/utils/http').fetchWithTimeoutSimple>())
vi.mock<typeof import('@modules/utils/http')>(import('@modules/utils/http'), async original => ({
  ...(await original()),
  fetchWithTimeoutSimple: fetch,
}))

describe('crawl dispatch indexed work selection', () => {
  it('uses hostname selection and relation-driven URL probes among unrelated URLs', async () => {
    const actor = await createTestUser()
    const suffix = randomUUID()
    const hostname = `crawl-plan-${suffix}.example.com`
    const target = (await insertTestUrlDirect(actor.id, `https://${hostname}/base`))!
    await updateUrlHostname(target.hostname.id, { is_crawlable: true })
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    const unrelated = (await insertTestUrlDirect(
      actor.id,
      `https://unrelated-${suffix}.example.com/base`,
    ))!
    await insertTestCrawlDispatchPlanUrls({
      ids: Array.from({ length: 3 }, () => mintUUIDv7()),
      hostname: unrelated.hostname.hostname,
      hostnameId: unrelated.hostname.id,
      actorId: actor.id,
    })
    const post = await createTestPost({ user: actor })
    const eligibleIds = Array.from({ length: 2 }, () => mintUUIDv7())
    await insertTestPostRelatedUrlBatch({
      postIds: eligibleIds.map(() => post.id),
      urlIds: eligibleIds,
      hostname,
      hostnameId: target.hostname.id,
      createdById: actor.id,
    })
    const tier2Ids = Array.from({ length: 2 }, () => mintUUIDv7())
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
      hostname: await dispatchCrawlUrlsPerHostname(target.hostname.id),
      tier1: await dispatchTier1CrawlUrls(),
      tier2: await dispatchTier2CrawlUrls(),
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
