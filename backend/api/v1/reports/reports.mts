import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  getModerationReportById,
  listModerationReports,
  listClusteredModerationReports,
  listRedactedModerationReports,
  currentUserCanResolveModerationReport,
  type ModerationReportSort,
  type ModerationReportStatus,
  MODERATION_REPORT_STATUSES,
  MODERATION_REPORT_RESOLUTION_STATUSES,
  type ModerationReportResolutionStatus,
  buildReportPageInfo,
  withoutClusterCursorMetadata,
  withoutCursorMetadata,
} from '@services/moderation-reports'
import { isModerationStaff } from '@services/users'
import { parseReportCursor, reportCursorScope } from './reports-cursor.mts'
import { apiResponse } from '../../response-contract.mts'
import {
  parseReportCursorQueryParams,
  reportsPaginationParser,
} from '../../report-pagination-helpers.mts'
import './reports-create.mts'

app.route('/api/v1/reports').get(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    user => user !== null,
    'GET:/api/v1/reports',
  )

  const cursorQuery = parseReportCursorQueryParams(ctx, ctx.query)
  const { limit } = reportsPaginationParser.parse(ctx.query)
  const { after, before } = cursorQuery

  const statusParam = ctx.query.status
  const status: ModerationReportStatus =
    typeof statusParam === 'string' &&
    MODERATION_REPORT_STATUSES.includes(statusParam as ModerationReportStatus)
      ? (statusParam as ModerationReportStatus)
      : 'pending'

  const isStaff = isModerationStaff(currentUser)
  const sortParam = ctx.query.sort
  const sort: ModerationReportSort = isStaff
    ? sortParam === 'created_at_asc' ||
      sortParam === 'created_at_desc' ||
      sortParam === 'most_reported' ||
      sortParam === 'severity'
      ? sortParam
      : 'severity'
    : sortParam === 'created_at_asc'
      ? 'created_at_asc'
      : 'created_at_desc'

  const beforeCursor = after || before ? parseReportCursor(ctx, after ?? before!) : undefined
  const cursorDirection: 'after' | 'before' = before ? 'before' : 'after'

  const clusterParam = ctx.query.cluster
  ctx.assert(clusterParam === undefined || clusterParam === 'entity', 422, 'Invalid cluster mode')

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
  const body = await parseJsonBody<{ status?: unknown }>(ctx)
  const status =
    typeof body.status === 'string' &&
    MODERATION_REPORT_RESOLUTION_STATUSES.includes(body.status as ModerationReportResolutionStatus)
      ? (body.status as ModerationReportResolutionStatus)
      : null
  ctx.assert(status, 422, 'Invalid status')

  const { resolveModerationReport } = await import('@services/moderation-reports/resolve')
  const report = await resolveModerationReport(id, {
    status,
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

  const report = await getModerationReportById(id)
  ctx.assert(report, 404, 'Report not found')

  const { enqueueReportJudgementAndWait } =
    await import('@queues/ai-agents/enqueues/report-judgement')
  // Await the enqueue so a queue-write failure surfaces as a 5xx instead of falsely
  // reporting the manual re-run as queued.
  await enqueueReportJudgementAndWait(
    report.entity_type,
    report.entity_id,
    report.id,
    currentUser.id,
  )

  ctx.setStatus(202)
  ctx.json({ queued: true, rerun_by_id: currentUser.id })
})
