import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  createTestPost,
  insertTestUrlDirect,
  insertTestPostRelatedUrlBatch,
  setTestRobotsTxtCache,
} from '@voucha/test-helpers'
import {
  insertTestCrawlDispatchPlanUrls,
  analyzeTestCrawlDispatchPlanTables,
} from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import {
  definePlanStatisticsRefresh,
  explainCapturedTestQuery,
  collectPlanNodes,
  planIndexNames,
} from '@voucha/test-helpers/query-plans'
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
    await updateUrlHostname(target.hostname.id, { crawlable: true })
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    const unrelated = (await insertTestUrlDirect(
      actor.id,
      `https://unrelated-${suffix}.example.com/base`,
    ))!
    await insertTestCrawlDispatchPlanUrls({
      ids: Array.from({ length: 10000 }, () => mintUUIDv7()),
      hostname: unrelated.hostname.hostname,
      hostnameId: unrelated.hostname.id,
      actorId: actor.id,
    })
    const post = await createTestPost({ user: actor })
    const eligibleIds = Array.from({ length: 10 }, () => mintUUIDv7())
    await insertTestPostRelatedUrlBatch({
      postIds: eligibleIds.map(() => post.id),
      urlIds: eligibleIds,
      hostname,
      hostnameId: target.hostname.id,
      createdById: actor.id,
    })
    const tier2Ids = Array.from({ length: 10 }, () => mintUUIDv7())
    await insertTestPostRelatedUrlBatch({
      postIds: tier2Ids.map(() => post.id),
      urlIds: tier2Ids,
      hostname,
      hostnameId: target.hostname.id,
      createdById: actor.id,
      votesScoreUp: 0,
    })
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { batch_size: 1, max_rows_per_run: 1 })
    const captured = await withCapturedTestQueries(async () => {
      await dispatchCrawlUrlsPerHostname(target.hostname.id)
      await dispatchTier1CrawlUrls()
      await dispatchTier2CrawlUrls()
    })
    for (const name of [
      'dispatchCrawlUrlsPerHostname',
      'dispatchTier1CrawlUrls',
      'dispatchTier2CrawlUrls',
    ]) {
      const query = captured.queries.find(query => query.text.startsWith(`/* ${name} */`))!
      expect(query).toBeDefined()
      const plan = await explainCapturedTestQuery(
        name,
        query,
        'force_custom_plan',
        definePlanStatisticsRefresh(analyzeTestCrawlDispatchPlanTables),
      )
      const urlNodes = collectPlanNodes(plan).filter(node => node['Relation Name'] === 'urls')
      expect(urlNodes.length).toBeGreaterThan(0)
      expect(urlNodes.every(node => node['Node Type'] !== 'Seq Scan')).toBe(true)
      expect(planIndexNames(plan).some(index => index.includes('urls'))).toBe(true)
    }
  })
})
