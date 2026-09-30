import { recordStaffOperation } from '@services/moderator-actions/operation'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  getModerationReportById,
  listModerationReports,
  listClusteredModerationReports,
  listRedactedModerationReports,
  currentUserCanResolveModerationReport,
  type ModerationReportSort,
  type ModerationReportResolutionStatus,
  buildReportPageInfo,
  withoutClusterCursorMetadata,
  withoutCursorMetadata,
} from '@services/moderation-reports'
import { isModerationStaff } from '@services/users'
import { parseReportCursor, reportCursorScope } from './reports-cursor.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
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
  const { limit } = reportsPaginationParser.parse(ctx.query)
  const { after, before } = cursorQuery

  const isStaff = isModerationStaff(currentUser)
  const { status, sort } = parseReportListFilters(ctx.query, isStaff)
  const sortParam = ctx.query.sort
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

  const beforeCursor = after || before ? parseReportCursor(ctx, after ?? before!) : undefined
  const cursorDirection: 'after' | 'before' = before ? 'before' : 'after'

  const cursorScope = reportCursorScope(
    isStaff ? 'staff' : 'member',
    isStaff ? null : currentUser.id,
  )
  ctx.assert(!beforeCursor || beforeCursor.scope === cursorScope, 422, 'Invalid cursor')
  const options = { limit, status, sort, beforeCursor: beforeCursor ?? null, cursorDirection }

  if (clusterParam === 'entity') {
    const clusterSort: ModerationReportSort =
      sortParam === 'created_at_asc' || sortParam === 'created_at_desc'
        ? sortParam
        : 'created_at_desc'
    ctx.assert(isStaff, 403, 'Forbidden')
    ctx.assert(!beforeCursor || beforeCursor.cluster, 422, 'Invalid cursor')
    ctx.assert(
      !beforeCursor || (beforeCursor.sort === clusterSort && beforeCursor.status === status),
      422,
      'Invalid cursor',
    )
    const response = await listClusteredModerationReports({
      ...options,
      beforeCursor: beforeCursor?.cluster ? beforeCursor : null,
      sort: clusterSort,
      cursorScope,
    })
    ctx.json(
      apiResponse('GET:/api/v1/reports#clustered', {
        ...response,
        results: response.results.map(withoutClusterCursorMetadata),
        duplicate_clusters: response.duplicate_clusters.map(duplicate => ({
          ...duplicate,
          clusters: duplicate.clusters.map(withoutClusterCursorMetadata),
        })),
      }),
    )
    return
  }

  ctx.assert(
    !beforeCursor ||
      (!beforeCursor.cluster && beforeCursor.sort === sort && beforeCursor.status === status),
    422,
    'Invalid cursor',
  )

  if (isStaff) {
    const { reports, hasNextPage, hasPreviousPage } = await listModerationReports(options)
    const responseReports = reports.map(withoutCursorMetadata)
    ctx.json(
      apiResponse('GET:/api/v1/reports#staff', {
        results: responseReports,
        page_info: buildReportPageInfo(reports, hasNextPage, hasPreviousPage, {
          sort,
          status,
          scope: cursorScope,
        }),
      }),
    )
  } else {
    const { reports, hasNextPage, hasPreviousPage } = await listRedactedModerationReports(options)
    const responseReports = reports.map(withoutCursorMetadata)
    ctx.json(
      apiResponse('GET:/api/v1/reports#member', {
        results: responseReports,
        page_info: buildReportPageInfo(reports, hasNextPage, hasPreviousPage, {
          sort,
          status,
          scope: cursorScope,
        }),
      }),
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

  const report = await getModerationReportById(id)
  ctx.assert(report, 404, 'Report not found')

  const { enqueueReportJudgementAndWait } =
    await import('@queues/ai-agents/enqueues/report-judgement')
  // Await the enqueue so a queue-write failure surfaces as a 5xx instead of falsely
  // reporting the manual re-run as queued.
  await recordStaffOperation(
    currentUser.id,
    { actionType: 'report_judgement_rerun', reportId: report.id },
    () =>
      enqueueReportJudgementAndWait(
        report.entity_type,
        report.entity_id,
        report.id,
        currentUser.id,
      ),
  )

  ctx.setStatus(202)
  ctx.json({ queued: true, rerun_by_id: currentUser.id })
})
