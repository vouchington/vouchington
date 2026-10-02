import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  listClassifierThresholdRevisions,
  listStaffClassifierCandidates,
  listStaffClassifiers,
} from '@services/classifiers'
import { isModerationStaff } from '@services/users'
import {
  buildPageInfo,
  createPaginationParser,
  decodeScopedUuidCursor,
  defineQueryContract,
  queryUuid,
} from '@modules/pagination'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../../response-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../../validate-paginated-query.mts'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})
const candidateScopeQuery = defineQueryContract({
  community_id: queryUuid({
    description: 'List this community-owned candidates; omitted lists the global candidates.',
  }),
})

// GET /api/v1/admin/classifiers — every classifier with its active prompt version defaults
app.route('/api/v1/admin/classifiers').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/admin/classifiers', parser)
  await requireAuthAndRateLimit(ctx, isModerationStaff, 'GET:/api/v1/admin/classifiers')
  const options = parseAndValidatePaginatedRequest(ctx, 'GET:/api/v1/admin/classifiers', parser)
  const scope = 'admin-classifiers'
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await listStaffClassifiers({ limit: options.limit, afterId })
  ctx.json(
    apiResponse('GET:/api/v1/admin/classifiers', {
      results,
      page_info: buildPageInfo(results, { hasNextPage, getCursor: row => ({ id: row.id, scope }) }),
    }),
  )
})

// GET /api/v1/admin/classifiers/:classifierId/candidates — candidates in one scope with the
// effective thresholds that would apply to the next decision
app.route('/api/v1/admin/classifiers/:classifierId/candidates').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/admin/classifiers/:classifierId/candidates', parser, candidateScopeQuery)
  await requireAuthAndRateLimit(
    ctx,
    isModerationStaff,
    'GET:/api/v1/admin/classifiers/:classifierId/candidates',
  )
  const classifierId = validateUUIDParam(ctx, 'classifierId')
  const options = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/admin/classifiers/:classifierId/candidates',
    parser,
    { path: true, extraQueryContracts: [candidateScopeQuery.queryContract] },
  )
  const communityId = typeof ctx.query.community_id === 'string' ? ctx.query.community_id : null
  const scope = `admin-classifier-candidates:${classifierId}:${communityId ?? 'global'}`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const page = await listStaffClassifierCandidates({
    classifierId,
    communityId,
    limit: options.limit,
    afterId,
  })
  ctx.assert(page.outcome === 'ok', 404, 'Classifier not found')
  ctx.json(
    apiResponse('GET:/api/v1/admin/classifiers/:classifierId/candidates', {
      results: page.results,
      page_info: buildPageInfo(page.results, {
        hasNextPage: page.hasNextPage,
        getCursor: row => ({ id: row.id, scope }),
      }),
    }),
  )
})

// GET /api/v1/admin/classifiers/:classifierId/candidates/:candidateId/thresholds — one
// candidate's revision history, newest first, across every prompt version
app
  .route('/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/thresholds')
  .get(async (ctx: Context) => {
    apiQuery(
      'GET:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/thresholds',
      parser,
    )
    await requireAuthAndRateLimit(
      ctx,
      isModerationStaff,
      'GET:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/thresholds',
    )
    const classifierId = validateUUIDParam(ctx, 'classifierId')
    const candidateId = validateUUIDParam(ctx, 'candidateId')
    const options = parseAndValidatePaginatedRequest(
      ctx,
      'GET:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/thresholds',
      parser,
      { path: true },
    )
    const scope = `admin-classifier-thresholds:${candidateId}`
    const beforeId = options.after
      ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
      : undefined
    const page = await listClassifierThresholdRevisions({
      classifierId,
      candidateId,
      limit: options.limit,
      beforeId,
    })
    ctx.assert(page.outcome === 'ok', 404, 'Classifier candidate not found')
    ctx.json(
      apiResponse(
        'GET:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/thresholds',
        {
          results: page.results,
          page_info: buildPageInfo(page.results, {
            hasNextPage: page.hasNextPage,
            getCursor: row => ({ id: row.id, scope }),
          }),
        },
      ),
    )
  })
