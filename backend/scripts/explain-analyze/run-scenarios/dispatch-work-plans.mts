import { dispatchCrawlUrlsPerHostname } from '@services/crawls/dispatch-per-hostname'
import { dispatchTier1CrawlUrls, dispatchTier2CrawlUrls } from '@services/crawls/dispatch-tier-urls'
import type { CrawlDispatchPageLimits } from '@services/crawls/work-limits'
import { dispatchReferralLinkCrawls } from '@services/crawler-referral-links/dispatch'
import { dispatchUnfurlReferralLinks } from '@services/referral-link-unfurl/dispatch'
import {
  prepareCrawlDispatchScale,
  prepareReferralCrawlScale,
  prepareReferralUnfurlScale,
} from '../seed-data/dispatch-work-plans.mts'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runDispatchWorkPlanScenarios(): Promise<void> {
  const crawl = await prepareCrawlDispatchScale()
  for (const id of [
    'dispatch-hostname-url-selectivity',
    'dispatch-tier1-url-selectivity',
    'dispatch-tier2-url-selectivity',
  ]) {
    registerScenarioContract(id, {
      seededRows: crawl.seededRows,
      crossPartition: {
        crawls:
          'URL-keyed recrawl eligibility checks embedding completion across crawl creation partitions; crawl IDs do not bound completion time.',
      },
      expectations: [{ kind: 'custom', name: 'dispatchUrlSelectivity' }],
    })
  }
  const cursor = { afterId: crawl.afterId, sweepStartedAt: crawl.sweepStartedAt }
  // The shared DynamicConfig map is replaced by Valkey refresh. Pass the page
  // directly so a refresh cannot widen these selectivity probes mid-run.
  const pageLimits: CrawlDispatchPageLimits = { batchSize: 1, maxRows: 1 }
  await runAndCapture(
    'dispatch-hostname-url-selectivity',
    async () => {
      const dispatched = await dispatchCrawlUrlsPerHostname(
        crawl.hostnameId,
        cursor,
        undefined,
        pageLimits,
      )
      if (dispatched.count !== 1)
        throw new Error(`Missing hostname crawl candidate (count ${dispatched.count})`)
    },
    undefined,
    'dispatchCrawlUrlsPerHostname',
  )
  await runAndCapture(
    'dispatch-tier1-url-selectivity',
    async () => {
      const dispatched = await dispatchTier1CrawlUrls(cursor, undefined, pageLimits)
      if (dispatched.count !== 1)
        throw new Error(`Missing positive-relation crawl candidate (count ${dispatched.count})`)
    },
    undefined,
    'dispatchTierCrawlUrls',
  )
  await runAndCapture(
    'dispatch-tier2-url-selectivity',
    async () => {
      const dispatched = await dispatchTier2CrawlUrls(cursor, undefined, pageLimits)
      if (dispatched.count !== 1)
        throw new Error(`Missing non-positive-relation crawl candidate (count ${dispatched.count})`)
    },
    undefined,
    'dispatchTierCrawlUrls',
  )

  const referral = await prepareReferralCrawlScale()
  await runAndCapture(
    'dispatch-referral-crawl-due-selectivity',
    async () => {
      const result = await dispatchReferralLinkCrawls({
        cursor: {
          sweepStartedAt: referral.sweepStartedAt,
          afterWork: { dueAt: '-infinity', id: referral.skipped[0] },
        },
        computeHostnameRateLimitMs: async () => 0,
        enqueueBulkCrawlReferralLinks: async () => {},
        limits: pageLimits,
      })
      if (
        result.count !== 0 ||
        !result.hasMore ||
        referral.skipped.length !== 2 ||
        referral.healthy.length !== 2
      )
        throw new Error('Missing retry-filtered due page')
    },
    undefined,
    'dispatchReferralLinkCrawls',
  )

  const unfurl = await prepareReferralUnfurlScale()
  await runAndCapture(
    'dispatch-referral-unfurl-due-selectivity',
    async () => {
      const result = await dispatchUnfurlReferralLinks(
        {
          sweepStartedAt: unfurl.dueAt,
          after: {
            requestedAt: new Date(new Date(unfurl.dueAt).getTime() - 1).toISOString(),
            id: unfurl.ids[0],
          },
        },
        undefined,
        { limits: pageLimits },
      )
      if (result.count !== 1 || !result.hasMore)
        throw new Error('Missing bounded pending-unfurl page')
    },
    undefined,
    'dispatchUnfurlReferralLinks',
  )
}

registerScenarioContract('dispatch-referral-crawl-due-selectivity', {
  seededRows: { user_referral_program_links: 10004 },
  expectations: [{ kind: 'custom', name: 'dispatchReferralCrawlSelectivity' }],
})
registerScenarioContract('dispatch-referral-unfurl-due-selectivity', {
  seededRows: { user_referral_program_links: 20014 },
  expectations: [{ kind: 'custom', name: 'dispatchReferralUnfurlSelectivity' }],
})
