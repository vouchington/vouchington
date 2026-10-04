import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
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
import { currentUserCanApplyVoteRingPenalty } from '@services/vote-integrity/authorization'
import {
  getVoteWeightPenalties,
  getVoteWeightPenaltiesByFlagIdFromPrimary,
  getVoteWeightPenaltyByIdFromPrimary,
  revokeVoteWeightPenalty,
  type GetVoteWeightPenaltiesOptions,
} from '@services/vote-integrity'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'

const penaltiesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})
const penaltiesQuery = defineQueryContract({
  status: queryEnum(['active', 'revoked']),
  source: queryEnum(['flag']),
  user_id: queryUuid(),
  source_flag_id: queryUuid(),
})

// GET /api/v1/vote-integrity/penalties
app.route('/api/v1/vote-integrity/penalties').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/vote-integrity/penalties', penaltiesParser, penaltiesQuery)
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyVoteRingPenalty,
    'GET:/api/v1/vote-integrity/penalties',
  )

  const { after, limit } = parseRuntimePagination(penaltiesParser, ctx.query)
  const { status, source, user_id, source_flag_id } = ctx.query as Record<
    string,
    string | undefined
  >
  ctx.assert(!status || status === 'active' || status === 'revoked', 422, 'Invalid status')
  ctx.assert(!source || source === 'flag', 422, 'Invalid source')
  ctx.assert(!user_id || isUUID(user_id), 422, 'Invalid user_id')
  ctx.assert(!source_flag_id || isUUID(source_flag_id), 422, 'Invalid source_flag_id')

  const query = prepareQueryForValidation(ctx.query, {
    ...penaltiesParser.queryContract,
    ...penaltiesQuery.queryContract,
  })
  if (ctx.query.limit !== undefined) query.limit = limit
  const validationQuery = Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== ''),
  )
  validateRequestContract(ctx, 'GET:/api/v1/vote-integrity/penalties', {
    query: validationQuery,
  })

  const statusFilter = status === 'active' || status === 'revoked' ? status : undefined
  const sourceFilter = source === 'flag' ? source : undefined
  const queryOptions: GetVoteWeightPenaltiesOptions = {
    status: statusFilter,
    source: sourceFilter,
    userId: user_id,
    after,
    limit,
  }
  const result = source_flag_id
    ? await getVoteWeightPenaltiesByFlagIdFromPrimary({
        ...queryOptions,
        sourceFlagId: source_flag_id,
      })
    : await getVoteWeightPenalties(queryOptions)

  ctx.json(result)
})

// GET /api/v1/vote-integrity/penalties/:id
app.route('/api/v1/vote-integrity/penalties/:id').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyVoteRingPenalty,
    'GET:/api/v1/vote-integrity/penalties/:id',
  )
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid penalty ID')
  validateRequestContract(ctx, 'GET:/api/v1/vote-integrity/penalties/:id', { path: ctx.params })
  const penalty = await getVoteWeightPenaltyByIdFromPrimary(ctx.params.id!)
  ctx.assert(penalty, 404, 'Penalty not found')
  ctx.json({ penalty })
})

// DELETE /api/v1/vote-integrity/penalties/:id
app.route('/api/v1/vote-integrity/penalties/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyVoteRingPenalty,
    'DELETE:/api/v1/vote-integrity/penalties/:id',
  )

  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid penalty ID')
  validateRequestContract(ctx, 'DELETE:/api/v1/vote-integrity/penalties/:id', { path: ctx.params })

  const penalty = await revokeVoteWeightPenalty(ctx.params.id!, currentUser.id)
  ctx.json({ penalty })
})
