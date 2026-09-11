import app from '../../app.mts'
import { requireAuth } from '../../response-helpers.mts'
import { currentUserCanTriggerCrawl } from '@services/urls'
import {
  currentUserCanViewLatestCrawl,
  currentUserCanViewCrawlHistory,
} from '@services/urls/authorization'
import {
  currentUserCanFilterHostnameModeration,
  stripHostnameElectionFields,
  toPublicViewHostname,
} from '@services/urls-hostnames'
import { getUrlByAnyCached } from '@services/entity-fetch/get'
import {
  enqueueManualUrlCrawlAsCurrentUser,
  getLatestSuccessfulCrawl,
  getLatestSuccessfulPublicUrlCrawlSummary,
} from '@services/crawls'
import { getMembershipByUserId } from '@services/memberships'
import { getRssFeedByUrlId } from '@services/rss-feeds'
import { isReferralLinkUrlId } from '@services/user-referral-program-links'
import { apiResponse } from '../../response-contract.mts'

app.route('/api/v1/urls/:id').get(async ctx => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/urls/:id')

  const canSeeModeration = currentUserCanFilterHostnameModeration(currentUser)
  const url = await getUrlByAnyCached(ctx.params.id!)
  if (!url) return ctx.throw(404, 'URL not found')
  if (url.hostname?.blocked && !canSeeModeration) return ctx.throw(404, 'URL not found')

  const canTriggerCrawl = currentUserCanTriggerCrawl(currentUser)
  const [membership, rssFeed, isReferralLink] = await Promise.all([
    canTriggerCrawl ? null : getMembershipByUserId(currentUser.id),
    getRssFeedByUrlId(url.id),
    isReferralLinkUrlId(url.id),
  ])
  const canViewLatestCrawl = currentUserCanViewLatestCrawl(currentUser, membership)
  const canViewCrawlHistory = currentUserCanViewCrawlHistory(currentUser, membership)

  const latestCrawl = canViewLatestCrawl
    ? canTriggerCrawl
      ? await getLatestSuccessfulCrawl(url.id)
      : await getLatestSuccessfulPublicUrlCrawlSummary(url.id)
    : null

  const publicUrl = {
    ...url,
    hostname: url.hostname
      ? canSeeModeration
        ? stripHostnameElectionFields(url.hostname)
        : toPublicViewHostname(url.hostname)
      : null,
  }

  let publicCrawl = null
  if (latestCrawl) {
    publicCrawl = latestCrawl
  }
  const urlType = rssFeed ? 'rss_feed' : isReferralLink ? 'referral_link' : 'url'

  const response = {
    url: publicUrl,
    latest_crawl: publicCrawl,
    can_view_latest_crawl: canViewLatestCrawl,
    can_view_crawl_history: canViewCrawlHistory,
    can_trigger_crawl: canTriggerCrawl,
    url_type: urlType,
    rss_feed_id: rssFeed?.id ?? null,
  }
  ctx.json(canTriggerCrawl ? apiResponse('GET:/api/v1/urls/:id#privileged', response) : response)
})

app.route('/api/v1/urls/:id/crawl').post(async ctx => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/urls/:id/crawl')

  const result = await enqueueManualUrlCrawlAsCurrentUser(currentUser, ctx.params.id!)

  ctx.json({ success: true, message: 'Crawl enqueued', ...result })
})
