import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  createPaginationParser,
  defineQueryContract,
  queryEnum,
  queryUuid,
} from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { isUUID } from '@modules/utils'
import { currentUserCanApplyReportAbusePenalty } from '@services/report-integrity/authorization'
import {
  getReportAbusePenalties,
  getReportAbusePenaltyByIdFromPrimary,
  revokeReportAbusePenalty,
} from '@services/report-integrity'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

const penaltiesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})
const penaltiesQuery = defineQueryContract({
  status: queryEnum(['active', 'revoked']),
  user_id: queryUuid(),
  source_flag_id: queryUuid(),
})

// GET /api/v1/report-integrity/penalties
app.route('/api/v1/report-integrity/penalties').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/report-integrity/penalties', penaltiesParser, penaltiesQuery)
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyReportAbusePenalty,
    'GET:/api/v1/report-integrity/penalties',
  )

  const { after, limit } = penaltiesParser.parse(ctx.query)
  const { status, user_id, source_flag_id } = ctx.query as Record<string, string | undefined>
  ctx.assert(!status || status === 'active' || status === 'revoked', 422, 'Invalid status')
  ctx.assert(!user_id || isUUID(user_id), 422, 'Invalid user_id')
  ctx.assert(!source_flag_id || isUUID(source_flag_id), 422, 'Invalid source_flag_id')

  const query = prepareQueryForValidation(ctx.query, {
    ...penaltiesParser.queryContract,
    ...penaltiesQuery.queryContract,
  })
  if (ctx.query.limit !== undefined) query.limit = limit
  // Empty filters are accepted as absent by the existing handler.
  const validationQuery = Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== ''),
  )
  validateRequestContract(ctx, 'GET:/api/v1/report-integrity/penalties', {
    query: validationQuery,
  })

  const statusFilter = status === 'active' || status === 'revoked' ? status : undefined
  const result = await getReportAbusePenalties({
    status: statusFilter,
    userId: user_id,
    sourceFlagId: source_flag_id,
    after,
    limit,
  })
  ctx.json(result)
})

// GET /api/v1/report-integrity/penalties/:id
app.route('/api/v1/report-integrity/penalties/:id').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyReportAbusePenalty,
    'GET:/api/v1/report-integrity/penalties/:id',
  )
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/report-integrity/penalties/:id', { path: ctx.params })
  const penalty = await getReportAbusePenaltyByIdFromPrimary(id)
  ctx.assert(penalty, 404, 'Report abuse penalty not found')
  ctx.json({ penalty })
})

// DELETE /api/v1/report-integrity/penalties/:id
// Revoke a report-abuse penalty, clearing bad_faith_reporter_at if it was the last active one.
app.route('/api/v1/report-integrity/penalties/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyReportAbusePenalty,
    'DELETE:/api/v1/report-integrity/penalties/:id',
  )

  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'DELETE:/api/v1/report-integrity/penalties/:id', {
    path: ctx.params,
  })
  const result = await revokeReportAbusePenalty(currentUser.id, id)
  ctx.json(result)
})
