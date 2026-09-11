import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import {
  currentUserCanApplyReportAbusePenalty,
  currentUserCanReviewReportIntegrityFlags,
} from '@services/report-integrity/authorization'
import {
  applyReportAbusePenalty,
  getReportIntegrityFlagByIdFromPrimary,
  getReportIntegrityFlags,
  INTEGRITY_FLAG_STATUSES,
  REPORT_INTEGRITY_PATCH_RESOLUTIONS,
  resolveReportIntegrityFlag,
  type IntegrityFlagStatus,
  type ReportIntegrityPatchResolution,
} from '@services/report-integrity'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'

const flagsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/report-integrity/flags
app.route('/api/v1/report-integrity/flags').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewReportIntegrityFlags,
    'GET:/api/v1/report-integrity/flags',
  )

  const { after, limit } = flagsParser.parse(ctx.query)
  const { status } = ctx.query as Record<string, string | undefined>
  const statusFilter = INTEGRITY_FLAG_STATUSES.includes(status as IntegrityFlagStatus)
    ? (status as IntegrityFlagStatus)
    : undefined

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
  const body = await ctx.request.json('10kb')
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    422,
    'Invalid request body',
  )
  const { resolution } = body as Record<string, unknown>
  const patchResolution =
    typeof resolution === 'string' &&
    REPORT_INTEGRITY_PATCH_RESOLUTIONS.includes(resolution as ReportIntegrityPatchResolution)
      ? (resolution as ReportIntegrityPatchResolution)
      : null
  ctx.assert(
    patchResolution,
    422,
    'resolution must be dismissed; use POST /flags/:id/penalties to penalize',
  )

  const flag = await resolveReportIntegrityFlag(id, currentUser.id, patchResolution)
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

  // applyReportAbusePenalty resolves the flag as penalized and inserts penalties
  // atomically in one transaction (404 if missing, 409 if already resolved).
  const result = await applyReportAbusePenalty(currentUser.id, id)

  ctx.setStatus(201)
  ctx.json(result)
})
