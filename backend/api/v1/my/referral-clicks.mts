import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { createPaginationParser } from '@modules/pagination'
import { getReferralClickLog } from '@services/attribution/click-log'
import { currentUserCanViewReferralClickLog } from '@services/attribution/authorization'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

const referralClicksParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

app.route('/api/v1/my/referral-clicks').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/referral-clicks', referralClicksParser)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    user => currentUserCanViewReferralClickLog(user, user.id),
    'GET:/api/v1/my/referral-clicks',
  )

  const options = parseRuntimePagination(referralClicksParser, ctx.query)
  const query = prepareQueryForValidation(ctx.query, referralClicksParser.queryContract)
  if (ctx.query.limit !== undefined) query.limit = options.limit
  validateRequestContract(ctx, 'GET:/api/v1/my/referral-clicks', { query })
  ctx.json(await getReferralClickLog(currentUser.id, options))
})
