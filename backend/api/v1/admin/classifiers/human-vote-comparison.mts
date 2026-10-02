import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getClassifierHumanVoteComparison } from '@services/classifiers'
import { isModerationStaff } from '@services/users'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { defineQueryContract, queryString, queryUuid } from '@modules/pagination'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../../response-contract.mts'

const comparisonQuery = defineQueryContract({
  from: queryString({
    description: 'Required. Inclusive window start as an ISO 8601 timestamp with an offset.',
  }),
  to: queryString({
    description:
      'Required. Exclusive window end as an ISO 8601 timestamp with an offset, after `from` by at most 31 days.',
  }),
  community_id: queryUuid({
    description: 'Only decisions evaluated under this community scope; omitted covers every scope.',
  }),
  post_id: queryUuid({ description: 'Only decisions made for this post.' }),
  rss_feed_item_id: queryUuid({ description: 'Only decisions made for this RSS feed item.' }),
})

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

// GET /api/v1/admin/classifiers/:classifierId/human-vote-comparison — aggregate comparison of a
// topic classifier's probabilities and effective thresholds with later human votes
app
  .route('/api/v1/admin/classifiers/:classifierId/human-vote-comparison')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/admin/classifiers/:classifierId/human-vote-comparison', comparisonQuery)
    await requireAuthAndRateLimit(
      ctx,
      isModerationStaff,
      'GET:/api/v1/admin/classifiers/:classifierId/human-vote-comparison',
    )
    const classifierId = validateUUIDParam(ctx, 'classifierId')
    const query = prepareQueryForValidation(ctx.query, comparisonQuery.queryContract)
    validateRequestContract(
      ctx,
      'GET:/api/v1/admin/classifiers/:classifierId/human-vote-comparison',
      { path: ctx.params, query },
    )
    const result = await getClassifierHumanVoteComparison({
      classifierId,
      from: parseRequiredTimestamp(ctx, query.from, 'from'),
      to: parseRequiredTimestamp(ctx, query.to, 'to'),
      communityId: optionalString(query.community_id),
      postId: optionalString(query.post_id),
      rssFeedItemId: optionalString(query.rss_feed_item_id),
    })
    if (result.outcome === 'not_found') ctx.throw(404, 'Classifier not found')
    if (result.outcome === 'invalid') ctx.throw(422, result.reason)
    if (result.outcome === 'unsupported') ctx.throw(422, result.reason)
    ctx.json(
      apiResponse(
        'GET:/api/v1/admin/classifiers/:classifierId/human-vote-comparison',
        result.comparison,
      ),
    )
  })

function parseRequiredTimestamp(ctx: Context, value: unknown, name: string): Date {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) {
    ctx.throw(422, `${name} is required and must be an ISO 8601 timestamp with an offset`)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) ctx.throw(422, `${name} is not a valid timestamp`)
  return date
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
