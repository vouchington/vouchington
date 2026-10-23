import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { getTopicClaimState, listTopicClaimsForUser } from '@services/topic-claims'
import { myTopicClaimFilters, topicClaimPageParser } from '@services/topic-claims/page-query'
import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import { apiQuery } from '../../api-query-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

// GET /api/v1/my/topic-claims — list current user's topic claims
app.route('/api/v1/my/topic-claims').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/topic-claims', topicClaimPageParser, myTopicClaimFilters)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/topic-claims')
  const options = parseRuntimePagination(topicClaimPageParser, ctx.query)
  const query = prepareQueryForValidation(ctx.query, {
    ...topicClaimPageParser.queryContract,
    ...myTopicClaimFilters.queryContract,
  })
  if (ctx.query.limit !== undefined) query.limit = options.limit
  validateRequestContract(ctx, 'GET:/api/v1/my/topic-claims', { query })
  const topicIds = ctx.query.topic_ids ? String(ctx.query.topic_ids).split(',') : undefined
  const page = await listTopicClaimsForUser(currentUser.id, {
    ...options,
    topicIds,
    verifiedOnly: query.verified_only === true,
  })
  ctx.json({
    results: page.results.map(claim => ({ ...claim, state: getTopicClaimState(claim) })),
    page_info: page.page_info,
  })
})
