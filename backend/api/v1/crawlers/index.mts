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
import { currentUserCanViewCrawler } from '@services/crawlers/authorization'
import { isAdminUser } from '@services/users'
import { isUUID } from '@modules/utils'
import { requireAuth, requireAuthAndRateLimit } from '../../response-helpers.mts'

app.route('/api/v1/crawlers').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/crawlers')

  const { hostname_id, referral_program_id } = ctx.query as {
    hostname_id?: string
    referral_program_id?: string
  }

  if (!hostname_id && !referral_program_id) {
    const limit = typeof ctx.query.limit === 'string' ? Number.parseInt(ctx.query.limit, 10) : 25
    const after = typeof ctx.query.after === 'string' ? ctx.query.after : null
    const { results, page_info } = await searchCrawlers({ limit, after })
    ctx.json({ results, page_info })
    return
  }

  if (referral_program_id) {
    ctx.assert(isUUID(referral_program_id), 400, 'Invalid referral_program_id')
    const crawlers = await getCrawlersByReferralProgramId(referral_program_id)
    ctx.json({ results: crawlers })
    return
  }

  ctx.assert(isUUID(hostname_id!), 400, 'Invalid hostname_id')
  const crawlers = await getCrawlersForHostname(hostname_id!)
  ctx.json({ results: crawlers })
})

app.route('/api/v1/crawlers/referral-program').put(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'PUT:/api/v1/crawlers/referral-program',
  )

  const body = (await ctx.request.json('1mb')) as {
    hostname_id?: string
    referral_program_id?: string
    crawler_type?: string
    css_selectors_to_remove?: unknown
    content_selectors?: unknown
  }

  ctx.assert(body.hostname_id, 400, 'hostname_id is required')
  ctx.assert(isUUID(body.hostname_id), 400, 'Invalid hostname_id')
  ctx.assert(body.referral_program_id, 400, 'referral_program_id is required')
  ctx.assert(isUUID(body.referral_program_id), 400, 'Invalid referral_program_id')

  if (body.crawler_type !== undefined) {
    ctx.assert(
      body.crawler_type === 'fetch' || body.crawler_type === 'automation',
      400,
      "crawler_type must be 'fetch' or 'automation'",
    )
  }

  if (body.css_selectors_to_remove !== undefined) {
    ctx.assert(
      Array.isArray(body.css_selectors_to_remove) &&
        body.css_selectors_to_remove.every(selector => typeof selector === 'string'),
      400,
      'css_selectors_to_remove must be an array of strings',
    )
  }

  if (body.content_selectors !== undefined) {
    ctx.assert(
      Array.isArray(body.content_selectors) &&
        body.content_selectors.every(selector => typeof selector === 'string'),
      400,
      'content_selectors must be an array of strings',
    )
  }

  const crawler = await upsertCrawlerForReferralProgram(
    currentUser,
    body.hostname_id,
    body.referral_program_id,
    {
      crawler_type: body.crawler_type as 'fetch' | 'automation' | undefined,
      css_selectors_to_remove: body.css_selectors_to_remove as string[] | undefined,
      content_selectors: body.content_selectors as string[] | undefined,
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

    const crawler = await getCrawlerByIdForUser(currentUser, ctx.params.id!)

    ctx.json({ crawler })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/crawlers/:id')

    const body = (await ctx.request.json('1mb')) as UpdateCrawlerUpdates
    const updatedCrawler = await updateCrawlerForUser(currentUser, ctx.params.id!, body)

    ctx.json({ crawler: updatedCrawler })
  })
