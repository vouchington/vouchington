import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestReferralProgram,
  createTestUrlWithHostname,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import { mintUUIDv7 } from '@modules/utils'
import { insertTestCrawlDispatchPlanUrls } from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import {
  insertTestUnfurlDispatchPlanLinks,
  analyzeTestUnfurlDispatchPlanTable,
} from '@voucha/test-helpers/entities/unfurl-dispatch-plans'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import {
  definePlanStatisticsRefresh,
  explainCapturedTestQuery,
  collectPlanNodes,
  planIndexNames,
} from '@voucha/test-helpers/query-plans'
import type { UnfurlDispatchCursor } from '@queues/unfurl-referral-links/types'
import { referralUnfurlDispatchConfig } from './work-limits.mts'
import { dispatchUnfurlReferralLinks } from './dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('bounded referral unfurl dispatch', () => {
  afterAll(() => unfurlReferralLinksQueue.close())

  it('resumes still-requested rows while excluding new requests from the fixed sweep', async () => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const requestedAt = new Date(Date.now() + 86400000).toISOString()
    const sweepStartedAt = requestedAt
    const urls = await Promise.all(Array.from({ length: 3 }, () => createTestUrlWithHostname()))
    const ids = await insertTestUnfurlDispatchPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urls,
      requestedAt,
    })
    const after = {
      requestedAt: new Date(new Date(requestedAt).getTime() - 1).toISOString(),
      id: ids[0],
    }
    overrideDynamicConfigFieldsForTest(referralUnfurlDispatchConfig, {
      batch_size: 1,
      max_rows_per_run: 1,
    })
    expect(await dispatchUnfurlReferralLinks({ sweepStartedAt, after })).toEqual({
      count: 1,
      hasMore: true,
    })
    const jobs = await unfurlReferralLinksQueue.searchJobs({
      name: 'unfurl_referral_links_dispatcher',
    })
    const cursor = jobs
      .map(job => (job.data as { cursor?: UnfurlDispatchCursor }).cursor)
      .find(cursor => cursor?.after?.id === ids[0])!
    const [later] = await insertTestUnfurlDispatchPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: [await createTestUrlWithHostname()],
      requestedAt: new Date(new Date(requestedAt).getTime() + 1).toISOString(),
    })
    expect(await dispatchUnfurlReferralLinks(cursor)).toEqual({ count: 1, hasMore: true })
    expect(
      await dispatchUnfurlReferralLinks({ ...cursor, after: { requestedAt, id: ids[1] } }),
    ).toEqual({
      count: 1,
      hasMore: false,
    })
    for (const parentLinkId of ids)
      expect(
        await unfurlReferralLinksQueue.searchJobs({
          name: 'unfurl_referral_link',
          data: { parentLinkId },
        }),
      ).toHaveLength(1)
    expect(
      await unfurlReferralLinksQueue.searchJobs({
        name: 'unfurl_referral_link',
        data: { parentLinkId: later },
      }),
    ).toEqual([])
  })
  it('uses the pending timestamp index for sparse due work among later requests on older links', async () => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const base = (await insertTestUrlDirect(owner.id, `https://${mintUUIDv7()}.example.com/base`))!
    const urlIds = Array.from({ length: 10010 }, () => mintUUIDv7())
    await insertTestCrawlDispatchPlanUrls({
      ids: urlIds,
      hostname: base.hostname.hostname,
      hostnameId: base.hostname.id,
      actorId: owner.id,
    })
    const dueAt = new Date(Date.now() + 172800000).toISOString()
    await insertTestUnfurlDispatchPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(0, 10000),
      requestedAt: new Date(new Date(dueAt).getTime() + 1).toISOString(),
    })
    const ids = await insertTestUnfurlDispatchPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(10000),
      requestedAt: dueAt,
    })
    overrideDynamicConfigFieldsForTest(referralUnfurlDispatchConfig, {
      batch_size: 1,
      max_rows_per_run: 1,
    })
    const captured = await withCapturedTestQueries(() =>
      dispatchUnfurlReferralLinks({
        sweepStartedAt: dueAt,
        after: { requestedAt: new Date(new Date(dueAt).getTime() - 1).toISOString(), id: ids[0] },
      }),
    )
    expect(captured.result).toEqual({ count: 1, hasMore: true })
    const query = captured.queries.find(query =>
      query.text.startsWith('/* dispatchUnfurlReferralLinks */'),
    )!
    const plan = await explainCapturedTestQuery(
      'dispatchUnfurlReferralLinks',
      query,
      'force_custom_plan',
      definePlanStatisticsRefresh(analyzeTestUnfurlDispatchPlanTable),
    )
    expect(planIndexNames(plan)).toContain('idx_user_referral_program_links__unfurl_requested')
    const nodes = collectPlanNodes(plan).filter(
      node => node['Relation Name'] === 'user_referral_program_links',
    )
    expect(nodes.every(node => node['Node Type'] !== 'Seq Scan')).toBe(true)
    expect(
      nodes.reduce((total, node) => total + Number(node['Rows Removed by Filter'] ?? 0), 0),
    ).toBeLessThanOrEqual(1)
  })
})
