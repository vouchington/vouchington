import app from '../../app.mts'
import { requireAuth } from '../../response-helpers.mts'
import {
  currentUserCanViewCrawlHistory,
  currentUserCanTriggerCrawl,
} from '@services/urls/authorization'
import { getMembershipByUserId } from '@services/memberships'
import { getUrlByAnyCached } from '@services/entity-fetch/get'
import { searchCrawlsForUrl, searchPublicUrlCrawlsForUrl } from '@services/crawls'
import { currentUserCanFilterHostnameModeration } from '@services/urls-hostnames'
import { createPaginationParser } from '@modules/pagination'
import { apiResponse } from '../../response-contract.mts'

const crawlsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})

app.route('/api/v1/urls/:id/crawls').get(async ctx => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/urls/:id/crawls')

  const membership = currentUserCanTriggerCrawl(currentUser)
    ? null
    : await getMembershipByUserId(currentUser.id)
  if (!currentUserCanViewCrawlHistory(currentUser, membership)) {
    return ctx.throw(403, 'Premium membership required')
  }

  const urlId = ctx.params.id!
  const url = await getUrlByAnyCached(urlId)
  if (!url) return ctx.throw(404, 'URL not found')

  const canSeeModeration = currentUserCanFilterHostnameModeration(currentUser)
  if (url.hostname?.blocked && !canSeeModeration) return ctx.throw(404, 'URL not found')

  const paginationOptions = crawlsParser.parse(ctx.query)
  const canViewHeaders = currentUserCanTriggerCrawl(currentUser)
  const searchOptions = {
    after: paginationOptions.after,
    limit: paginationOptions.limit,
  }
  if (!canViewHeaders) {
    const result = await searchPublicUrlCrawlsForUrl(url.id, searchOptions)
    ctx.json(apiResponse('GET:/api/v1/urls/:id/crawls#paid', result))
    return
  }

  const result = await searchCrawlsForUrl(url.id, searchOptions)
  ctx.json(apiResponse('GET:/api/v1/urls/:id/crawls#privileged', result))
})
