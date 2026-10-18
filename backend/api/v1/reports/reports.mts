import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import { withPrimaryReads } from '@data-stores/psql'
import { rerunReportJudgement } from '@services/moderation-reports/rerun-judgement'
import { listModerationReportPage } from '@services/moderation-reports/list-page'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  currentUserCanResolveModerationReport,
  getModerationReportById,
  getReportJudgementRunResult,
  type ModerationReportResolutionStatus,
} from '@services/moderation-reports'
import { isModerationStaff } from '@services/users'
import { apiResponse } from '@vouchington/utils/api-response-contract'
import { apiQuery } from '../../api-query-contract.mts'
import {
  parseReportCursorQueryParams,
  parseReportListFilters,
  reportsFilterQuery,
  reportsPaginationParser,
} from '../../report-pagination-helpers.mts'
import './reports-create.mts'

type ResolveModerationReportRequest = { status: ModerationReportResolutionStatus }

app.route('/api/v1/reports').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/reports', reportsPaginationParser, reportsFilterQuery)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    user => user !== null,
    'GET:/api/v1/reports',
  )

  // `status` and `sort` fall back to their defaults instead of failing, and the parsers keep their
  // own 400/422 answers, so the contract below checks the settled values.
  const cursorQuery = parseReportCursorQueryParams(ctx, ctx.query)
  const { limit } = parseRuntimePagination(reportsPaginationParser, ctx.query)
  const { after, before } = cursorQuery

  const isStaff = isModerationStaff(currentUser)
  const { status, sort } = parseReportListFilters(ctx.query, isStaff)
  const clusterParam = ctx.query.cluster
  validateRequestContract(ctx, 'GET:/api/v1/reports', {
    query: {
      limit,
      status,
      sort,
      ...(clusterParam !== undefined && { cluster: clusterParam }),
      ...(after !== undefined && { after }),
      ...(before !== undefined && { before }),
    },
  })

  const options = { limit, after, before, status, sort }
  if (clusterParam) {
    ctx.assert(isStaff, 403, 'Forbidden')
    ctx.json(
      apiResponse(
        'GET:/api/v1/reports#clustered',
        await withPrimaryReads(() =>
          listModerationReportPage('staff', null, { ...options, cluster: 'entity' }),
        ),
      ),
    )
  } else if (isStaff) {
    ctx.json(
      apiResponse(
        'GET:/api/v1/reports#staff',
        await withPrimaryReads(() => listModerationReportPage('staff', null, options)),
      ),
    )
  } else {
    ctx.json(
      apiResponse(
        'GET:/api/v1/reports#member',
        await listModerationReportPage('member', currentUser.id, options),
      ),
    )
  }
})

app.route('/api/v1/reports/:id').patch(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveModerationReport,
    'PATCH:/api/v1/reports/:id',
  )
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<ResolveModerationReportRequest>(ctx)
  validateRequestContract(ctx, 'PATCH:/api/v1/reports/:id', { body, path: ctx.params })

  const { resolveModerationReport } = await import('@services/moderation-reports/resolve')
  const report = await resolveModerationReport(id, {
    status: body.status,
    trainingEvidence: 'staff_or_user',
    resolvedById: currentUser.id,
  })

  ctx.json({ report })
})

app.route('/api/v1/reports/:id/judgements').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveModerationReport,
    'POST:/api/v1/reports/:id/judgements',
  )
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/reports/:id/judgements', { path: ctx.params })

  const runId = await rerunReportJudgement(currentUser.id, id)

  ctx.setStatus(202)
  ctx.json({ queued: true, rerun_by_id: currentUser.id, run_id: runId })
})

app.route('/api/v1/reports/:id/judgements/:runId').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveModerationReport,
    'GET:/api/v1/reports/:id/judgements/:runId',
  )
  const id = validateUUIDParam(ctx, 'id')
  const runId = validateUUIDParam(ctx, 'runId')
  validateRequestContract(ctx, 'GET:/api/v1/reports/:id/judgements/:runId', { path: ctx.params })
  const report = await getModerationReportById(id, { primary: true })
  ctx.assert(report, 404, 'Report not found')
  ctx.json(await withPrimaryReads(() => getReportJudgementRunResult(id, runId)))
})
