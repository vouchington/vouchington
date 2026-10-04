import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestReferralProgram,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { insertTestCrawlDispatchPlanUrls } from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import {
  insertTestReferralCrawlPlanLinks,
  analyzeTestUnfurlDispatchPlanTable,
} from '@voucha/test-helpers/entities/unfurl-dispatch-plans'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import {
  definePlanStatisticsRefresh,
  explainCapturedTestQuery,
  collectPlanNodes,
  planIndexNames,
} from '@voucha/test-helpers/query-plans'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { mintUUIDv7 } from '@modules/utils'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import type { ReferralCrawlDispatchData } from '@queues/crawl-referral-links/types'
import { referralCrawlDispatchConfig } from '../work-limits.mts'
import { dispatchReferralLinkCrawls } from '../dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), original => original())
describe('indexed referral crawl candidates', () => {
  afterAll(() => crawlReferralLinksQueue.close())

  it('selects a bounded due page before retry filtering and advances past skipped candidates', async () => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const base = (await insertTestUrlDirect(owner.id, `https://${mintUUIDv7()}.example.com/base`))!
    const urlIds = Array.from({ length: 10004 }, () => mintUUIDv7())
    await insertTestCrawlDispatchPlanUrls({
      ids: urlIds,
      hostname: base.hostname.hostname,
      hostnameId: base.hostname.id,
      actorId: owner.id,
    })
    const requestedAt = new Date().toISOString()
    await insertTestReferralCrawlPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(0, 10000),
      lastSuccessAt: requestedAt,
    })
    const skipped = await insertTestReferralCrawlPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(10000, 10002),
      lastSuccessAt: null,
      lastFailureAt: requestedAt,
    })
    const healthy = await insertTestReferralCrawlPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(10002),
      lastSuccessAt: null,
    })
    const sweepStartedAt = new Date().toISOString()
    const ids = [...skipped, ...healthy].toSorted()
    const queued: string[] = []
    const dependencies = {
      computeHostnameRateLimitMs: async () => 0,
      enqueueBulkCrawlReferralLinks: async (entries: { linkId: string }[]) => {
        queued.push(...entries.map(row => row.linkId))
      },
    }
    overrideDynamicConfigFieldsForTest(referralCrawlDispatchConfig, {
      batch_size: 1,
      max_rows_per_run: 1,
    })
    const captured = await withCapturedTestQueries(() =>
      dispatchReferralLinkCrawls({ ...dependencies }),
    )
    const query = captured.queries.find(query =>
      query.text.startsWith('/* dispatchReferralLinkCrawls */'),
    )!
    const plan = await explainCapturedTestQuery(
      'dispatchReferralLinkCrawls',
      query,
      'force_custom_plan',
      definePlanStatisticsRefresh(analyzeTestUnfurlDispatchPlanTable),
    )
    expect(planIndexNames(plan)).toContain('idx_user_referral_program_links__crawl_due')
    const nodes = collectPlanNodes(plan).filter(
      node => node['Relation Name'] === 'user_referral_program_links',
    )
    expect(nodes.every(node => node['Node Type'] !== 'Seq Scan')).toBe(true)
    expect(
      nodes.reduce((total, node) => total + Number(node['Actual Rows'] ?? 0), 0),
    ).toBeLessThanOrEqual(2)
    queued.length = 0
    let data: ReferralCrawlDispatchData = { referralLinkIds: ids, cursor: { sweepStartedAt } }
    for (const id of ids) {
      const result = await dispatchReferralLinkCrawls({ ...data, ...dependencies })
      expect(result.count).toBe(skipped.includes(id) ? 0 : 1)
      expect(result.hasMore).toBe(id !== ids.at(-1))
      if (!result.hasMore) break
      const jobs = await crawlReferralLinksQueue.searchJobs({
        name: 'crawl_referral_links_dispatcher',
      })
      data = jobs
        .map(job => job.data as ReferralCrawlDispatchData)
        .find(data => data.cursor?.afterWork?.id === id)!
      expect(data.referralLinkIds).toEqual(ids)
      expect(data.cursor?.sweepStartedAt).toBe(sweepStartedAt)
    }
    expect(queued.toSorted()).toEqual(healthy)
  })
})
