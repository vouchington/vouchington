import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getCrawlersForHostname,
  getCrawlersByReferralProgramId,
  getCrawlerByIdForUser,
  updateCrawlerForUser,
  upsertCrawlerForReferralProgram,
  searchCrawlers,
  type UpdateCrawlerUpdates,
} from '@services/crawlers'
import {
  currentUserCanEditCrawler,
  currentUserCanViewCrawler,
} from '@services/crawlers/authorization'
import { isAdminUser } from '@services/users'
import { isUUID } from '@modules/utils'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { defineQueryContract, queryInteger, queryString, queryUuid } from '@modules/pagination'
import type { ApiUuidContract } from '../../request-contract-types.mts'

type UpsertReferralProgramCrawlerRequest = {
  hostname_id: ApiUuidContract
  referral_program_id: ApiUuidContract
  crawler_type?: 'fetch' | 'automation'
  css_selectors_to_remove?: string[]
  content_selectors?: string[]
}

const crawlersQuery = defineQueryContract({
  hostname_id: queryUuid(),
  referral_program_id: queryUuid(),
  limit: queryInteger({ minimum: 1, maximum: 100, default: 25 }),
  after: queryString(),
})

app.route('/api/v1/crawlers').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/crawlers', crawlersQuery)
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/crawlers')

  const { hostname_id, referral_program_id } = ctx.query as {
    hostname_id?: string
    referral_program_id?: string
  }

  if (!hostname_id && !referral_program_id) {
    const parsedLimit =
      typeof ctx.query.limit === 'string' ? Number.parseInt(ctx.query.limit, 10) : 25
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 25 : Math.min(parsedLimit, 100)
    const after = typeof ctx.query.after === 'string' ? ctx.query.after : null
    validateRequestContract(ctx, 'GET:/api/v1/crawlers', {
      query: {
        limit,
        ...(after ? { after } : {}),
      },
    })
    const { results, page_info } = await searchCrawlers({ limit, after })
    ctx.json({ results, page_info })
    return
  }

  if (referral_program_id) {
    ctx.assert(isUUID(referral_program_id), 400, 'Invalid referral_program_id')
    validateRequestContract(ctx, 'GET:/api/v1/crawlers', {
      query: { referral_program_id },
    })
    const crawlers = await getCrawlersByReferralProgramId(referral_program_id)
    ctx.json({ results: crawlers })
    return
  }

  ctx.assert(isUUID(hostname_id!), 400, 'Invalid hostname_id')
  validateRequestContract(ctx, 'GET:/api/v1/crawlers', { query: { hostname_id } })
  const crawlers = await getCrawlersForHostname(hostname_id!)
  ctx.json({ results: crawlers })
})

app.route('/api/v1/crawlers/referral-program').put(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'PUT:/api/v1/crawlers/referral-program',
  )

  const body = (await ctx.request.json('1mb')) as UpsertReferralProgramCrawlerRequest
  validateRequestContract(ctx, 'PUT:/api/v1/crawlers/referral-program', { body })

  const crawler = await upsertCrawlerForReferralProgram(
    currentUser,
    body.hostname_id,
    body.referral_program_id,
    {
      crawler_type: body.crawler_type,
      css_selectors_to_remove: body.css_selectors_to_remove,
      content_selectors: body.content_selectors,
    },
  )

  ctx.json({ crawler })
})

app
  .route('/api/v1/crawlers/:id')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanViewCrawler,
      'GET:/api/v1/crawlers/:id',
    )

    validateRequestContract(ctx, 'GET:/api/v1/crawlers/:id', { path: ctx.params })

    const crawler = await getCrawlerByIdForUser(currentUser, ctx.params.id!)

    ctx.json({ crawler })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanEditCrawler,
      'PATCH:/api/v1/crawlers/:id',
    )

    const body = (await ctx.request.json('1mb')) as UpdateCrawlerUpdates
    validateRequestContract(ctx, 'PATCH:/api/v1/crawlers/:id', { body, path: ctx.params })

    const updatedCrawler = await updateCrawlerForUser(currentUser, ctx.params.id!, body)

    ctx.json({ crawler: updatedCrawler })
  })
