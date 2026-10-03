import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser, defineQueryContract, queryEnum } from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { isUUID } from '@modules/utils'
import {
  currentUserCanApplyVoteRingPenalty,
  currentUserCanReviewVoteIntegrityFlags,
} from '@services/vote-integrity/authorization'
import {
  getVoteIntegrityFlags,
  getVoteIntegrityFlagByIdFromPrimary,
  resolveVoteIntegrityFlag,
  applyVoteRingPenalty,
  INTEGRITY_FLAG_STATUSES,
  type IntegrityFlagStatus,
  type VoteIntegrityResolution,
} from '@services/vote-integrity'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
} from '../../response-helpers.mts'

type ResolveVoteIntegrityFlagRequest = { resolution: VoteIntegrityResolution }

const flagsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})
const flagsQuery = defineQueryContract({ status: queryEnum(INTEGRITY_FLAG_STATUSES) })

// GET /api/v1/vote-integrity/flags
app.route('/api/v1/vote-integrity/flags').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/vote-integrity/flags', flagsParser, flagsQuery)
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewVoteIntegrityFlags,
    'GET:/api/v1/vote-integrity/flags',
  )

  const { after, limit } = flagsParser.parse(ctx.query)
  const { status } = ctx.query as Record<string, string | undefined>
  const statusFilter = INTEGRITY_FLAG_STATUSES.includes(status as IntegrityFlagStatus)
    ? (status as IntegrityFlagStatus)
    : undefined
  const query = prepareQueryForValidation(ctx.query, {
    ...flagsParser.queryContract,
    ...flagsQuery.queryContract,
  })
  if (ctx.query.limit !== undefined) query.limit = limit
  const validationQuery = Object.fromEntries(
    Object.entries(query).filter(([key]) => key !== 'status' || statusFilter !== undefined),
  )
  validateRequestContract(ctx, 'GET:/api/v1/vote-integrity/flags', { query: validationQuery })

  const result = await getVoteIntegrityFlags({
    status: statusFilter,
    after,
    limit,
  })

  ctx.json({ results: result.results, page_info: result.page_info })
})

// GET /api/v1/vote-integrity/flags/:id
app.route('/api/v1/vote-integrity/flags/:id').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewVoteIntegrityFlags,
    'GET:/api/v1/vote-integrity/flags/:id',
  )

  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid flag ID')
  validateRequestContract(ctx, 'GET:/api/v1/vote-integrity/flags/:id', { path: ctx.params })

  const flag = await getVoteIntegrityFlagByIdFromPrimary(ctx.params.id!)
  ctx.assert(flag, 404, 'Flag not found')

  ctx.json({ flag })
})

// PATCH /api/v1/vote-integrity/flags/:id
app.route('/api/v1/vote-integrity/flags/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewVoteIntegrityFlags,
    'PATCH:/api/v1/vote-integrity/flags/:id',
  )

  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid flag ID')

  const body = await parseJsonBody<ResolveVoteIntegrityFlagRequest>(ctx, '10kb')
  validateRequestContract(ctx, 'PATCH:/api/v1/vote-integrity/flags/:id', {
    body,
    path: ctx.params,
  })

  const flag = await resolveVoteIntegrityFlag(ctx.params.id!, currentUser.id, body.resolution)
  ctx.json({ flag })
})

// POST /api/v1/vote-integrity/flags/:id/penalties
app.route('/api/v1/vote-integrity/flags/:id/penalties').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyVoteRingPenalty,
    'POST:/api/v1/vote-integrity/flags/:id/penalties',
  )

  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid flag ID')
  validateRequestContract(ctx, 'POST:/api/v1/vote-integrity/flags/:id/penalties', {
    path: ctx.params,
  })

  const result = await applyVoteRingPenalty(ctx.params.id!, currentUser.id)
  ctx.json(result)
})
