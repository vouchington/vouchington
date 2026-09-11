import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { createPaginationParser } from '@modules/pagination'
import { getReferralClickLog } from '@services/attribution/click-log'
import { currentUserCanViewReferralClickLog } from '@services/attribution/authorization'

const referralClicksParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

app.route('/api/v1/my/referral-clicks').get(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    user => currentUserCanViewReferralClickLog(user, user.id),
    'GET:/api/v1/my/referral-clicks',
  )

  const options = referralClicksParser.parse(ctx.query)
  ctx.json(await getReferralClickLog(currentUser.id, options))
})
