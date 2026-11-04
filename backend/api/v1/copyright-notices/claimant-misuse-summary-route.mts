import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryString } from '@vouchington/pagination'
import { readClaimantMisuseSummaryPage } from '@services/copyright-notices/claimant-misuse-summary'
import { currentUserCanReviewCopyrightNotices } from '@services/copyright-notices/authorization'
import { assertNotSuspended } from '@services/users'
import app from '../../app.mts'
import { apiQuery } from '../../api-query-contract.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiResponse } from '@vouchington/utils/api-response-contract'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

const route = 'GET:/api/v1/copyright-notices/claimants/:claimantUserId/misuse-summary' as const
const queryContract = defineQueryContract({ after: queryString() })

app
  .route('/api/v1/copyright-notices/claimants/:claimantUserId/misuse-summary')
  .get(async (ctx: Context) => {
    apiQuery(route, queryContract)
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      route,
    )
    assertNotSuspended(currentUser)
    const claimantUserId = validateUUIDParam(ctx, 'claimantUserId')
    const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined
    validateRequestContract(ctx, route, {
      path: ctx.params,
      query: ctx.query,
    })
    ctx.json(
      apiResponse(route, {
        claimant_misuse: await readClaimantMisuseSummaryPage(claimantUserId, after),
      }),
    )
  })
