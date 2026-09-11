import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import {
  getReferralLinksFeed,
  VALID_REFERRAL_LINKS_FEED_TYPES,
  type ReferralLinksFeedType,
} from '@services/feeds'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

const referralLinksFeedParser = createPaginationParser({
  cursor: { type: 'simple' as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {},
})

app.route('/api/v1/feeds/referral_links/:feed_type').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/feeds/referral_links/:feed_type')
  const feedType = ctx.params.feed_type
  ctx.assert(
    VALID_REFERRAL_LINKS_FEED_TYPES.includes(feedType as ReferralLinksFeedType),
    404,
    `Invalid feed_type. Must be one of: ${VALID_REFERRAL_LINKS_FEED_TYPES.join(', ')}`,
  )
  const paginationOptions = referralLinksFeedParser.parse(ctx.query)
  const result = await getReferralLinksFeed(
    currentUser,
    feedType as ReferralLinksFeedType,
    paginationOptions,
  )
  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(result))
})
