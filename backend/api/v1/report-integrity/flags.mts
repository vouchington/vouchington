import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser, defineQueryContract, queryEnum } from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import {
  currentUserCanApplyReportAbusePenalty,
  currentUserCanReviewReportIntegrityFlags,
} from '@services/report-integrity/authorization'
import {
  applyReportAbusePenalty,
  getReportIntegrityFlagByIdFromPrimary,
  getReportIntegrityFlags,
  INTEGRITY_FLAG_STATUSES,
  resolveReportIntegrityFlag,
  type IntegrityFlagStatus,
  type ReportIntegrityPatchResolution,
} from '@services/report-integrity'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

type ResolveReportIntegrityFlagRequest = { resolution: ReportIntegrityPatchResolution }

const flagsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})
const flagsQuery = defineQueryContract({ status: queryEnum(INTEGRITY_FLAG_STATUSES) })

// GET /api/v1/report-integrity/flags
app.route('/api/v1/report-integrity/flags').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/report-integrity/flags', flagsParser, flagsQuery)
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewReportIntegrityFlags,
    'GET:/api/v1/report-integrity/flags',
  )

  const { after, limit } = parseRuntimePagination(flagsParser, ctx.query)
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
  validateRequestContract(ctx, 'GET:/api/v1/report-integrity/flags', { query: validationQuery })

  const result = await getReportIntegrityFlags({
    status: statusFilter,
    after,
    limit,
  })

  ctx.json({ results: result.results, page_info: result.page_info })
})

// GET /api/v1/report-integrity/flags/:id
app.route('/api/v1/report-integrity/flags/:id').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewReportIntegrityFlags,
    'GET:/api/v1/report-integrity/flags/:id',
  )

  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/report-integrity/flags/:id', { path: ctx.params })
  const flag = await getReportIntegrityFlagByIdFromPrimary(id)
  ctx.assert(flag, 404, 'Flag not found')

  ctx.json({ flag })
})

// PATCH /api/v1/report-integrity/flags/:id
// Dismiss a flag. Penalized resolutions must go through POST /flags/:id/penalties,
// which resolves the flag AND applies penalties atomically — a PATCH 'penalized'
// would mark the flag resolved without ever penalizing reporters (and the penalty
// endpoint then rejects the already-resolved flag), so it is disallowed here.
app.route('/api/v1/report-integrity/flags/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewReportIntegrityFlags,
    'PATCH:/api/v1/report-integrity/flags/:id',
  )

  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<ResolveReportIntegrityFlagRequest>(ctx, '10kb')
  // Name the penalties route before the generic enum rejection; the body may be any JSON value.
  ctx.assert(
    (body as { resolution?: unknown } | null)?.resolution !== 'penalized',
    422,
    'resolution must be dismissed; use POST /api/v1/report-integrity/flags/:id/penalties to penalize',
  )
  validateRequestContract(ctx, 'PATCH:/api/v1/report-integrity/flags/:id', {
    body,
    path: ctx.params,
  })

  const flag = await resolveReportIntegrityFlag(id, currentUser.id, body.resolution)
  ctx.json({ flag })
})

// POST /api/v1/report-integrity/flags/:id/penalties
// Investigate a flag: insert report_abuse_penalties for the reporters and
// resolve the flag as penalized.
app.route('/api/v1/report-integrity/flags/:id/penalties').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApplyReportAbusePenalty,
    'POST:/api/v1/report-integrity/flags/:id/penalties',
  )

  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/report-integrity/flags/:id/penalties', {
    path: ctx.params,
  })

  // applyReportAbusePenalty resolves the flag as penalized and inserts penalties
  // atomically in one transaction (404 if missing, 409 if already resolved).
  const result = await applyReportAbusePenalty(currentUser.id, id)

  ctx.setStatus(201)
  ctx.json(result)
})
