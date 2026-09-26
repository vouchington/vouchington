import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { loadCommunityForModerator, getCommunityOrThrow } from '@services/communities'
import {
  resolveModerationReport,
  getReporterForCommunityReport,
  MODERATION_REPORT_RESOLUTION_STATUSES,
  type ModerationReportResolutionStatus,
  buildReportPageInfo,
} from '@services/moderation-reports'
import { listCommunityPendingModerationReports } from '@services/moderation-claims'
import { assertNotSuspended, isModerationStaff } from '@services/users'
import { getPrivateUserByAny } from '@services/users/get'
import { findOrCreateDirectConversation } from '@services/messaging'
import { isUserBlockedOrMuted } from '@services/entity-relations/check-block-mute'
import { createPaginationParser, defineQueryContract, queryEnum } from '@modules/pagination'
import { parseReportCursor } from '../reports/reports-cursor.mts'
import { apiQuery } from '../../response-contract.mts'
import {
  communityModeratorVisibleReportSort,
  parseCommunityReportSort,
  redactCommunityBanEvasionContext,
  redactCommunityReport,
} from './reports-helpers.mts'

const pendingReportsPaginationParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})
const pendingReportsFilterQuery = defineQueryContract({
  sort: queryEnum(['severity', 'most_reported', 'created_at_asc', 'created_at_desc'] as const),
})

app.route('/api/v1/communities/:idOrSlug/reports/pending').get(async (ctx: Context) => {
  apiQuery(
    'GET:/api/v1/communities/:idOrSlug/reports/pending',
    pendingReportsPaginationParser,
    pendingReportsFilterQuery,
  )
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/reports/pending')
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const isStaff = isModerationStaff(currentUser)
  // Site staff (admins + moderators) can access any community's reports without membership.
  const community = isStaff
    ? await getCommunityOrThrow(idOrSlug)
    : (await loadCommunityForModerator(currentUser, idOrSlug)).community
  // The generated query contract types `limit` as an integer (1-100) sourced from this route's
  // pagination parser, but `ctx.query` always carries raw HTTP strings and the shared registry
  // performs no type coercion. The existing pagination parser also clamps an out-of-range `limit`
  // to 100 and returns 200, while the generated contract's `maximum: 100` would reject it — and
  // `sort` defaults to 'severity' on any unrecognized value rather than rejecting it — so running
  // the shared validator against the raw query here would change today's clamping/defaulting
  // behavior into a 422. Query-carrier validation is intentionally skipped for this operation;
  // only the path carrier is validated below.
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/reports/pending', {
    path: ctx.params,
  })
  const { limit, after } = pendingReportsPaginationParser.parse(ctx.query)
  const requestedSort = parseCommunityReportSort(ctx.query.sort)
  const sort = isStaff ? requestedSort : communityModeratorVisibleReportSort(requestedSort)
  const cursorScope = `community-pending-reports:${community.id}:${isStaff ? 'staff' : 'member'}`
  const cursor = after ? parseReportCursor(ctx, after) : null
  ctx.assert(
    !cursor ||
      (!cursor.cluster &&
        cursor.scope === cursorScope &&
        cursor.sort === sort &&
        cursor.status === 'pending'),
    422,
    'Invalid cursor',
  )

  const { reports, hasNextPage } = await listCommunityPendingModerationReports({
    communityId: community.id,
    limit,
    sort,
    afterCursor: cursor?.cluster
      ? null
      : cursor
        ? {
            id: cursor.id,
            reportCount: cursor.reportCount,
            severityRank: cursor.severityRank,
          }
        : null,
  })

  // Community moderators must not see reporter identity, reporter notes, note-derived
  // judgements, or anonymous-post author UUIDs — only site staff can deanonymize.
  ctx.json({
    reports: reports.map(
      ({
        cursor_created_at: _,
        cursor_report_count: __,
        cursor_severity_rank: ___,
        reporter_user_id,
        reporter_username,
        note,
        judgement,
        community_ban_evasion,
        is_system_generated: _sg,
        target_is_restricted: _tr,
        target_is_anonymous,
        post_moderation_context: _pmc,
        ...report
      }) => ({
        ...report,
        ...(isStaff
          ? { reporter_user_id, reporter_username, note, judgement, community_ban_evasion }
          : {
              judgement: null,
              community_ban_evasion: community_ban_evasion
                ? redactCommunityBanEvasionContext(community_ban_evasion)
                : community_ban_evasion,
            }),
        target_user_id: isStaff || !target_is_anonymous ? report.target_user_id : null,
      }),
    ),
    page_info: buildReportPageInfo(reports, hasNextPage, Boolean(cursor), {
      sort,
      status: 'pending',
      scope: cursorScope,
    }),
  })
})

app.route('/api/v1/communities/:idOrSlug/reports/:reportId/modmail').post(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/communities/:idOrSlug/reports/:reportId/modmail',
  )
  assertNotSuspended(currentUser)
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const reportId = validateUUIDParam(ctx, 'reportId')
  ctx.assert(isModerationStaff(currentUser), 403, 'Forbidden')
  validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/reports/:reportId/modmail', {
    path: ctx.params,
  })
  const community = await getCommunityOrThrow(idOrSlug)
  const reporterUserId = await getReporterForCommunityReport(reportId, community.id)
  ctx.assert(reporterUserId, 404, 'Report not found in this community')
  ctx.assert(reporterUserId !== currentUser.id, 400, 'Cannot send a message to yourself')
  const reporterUser = await getPrivateUserByAny(reporterUserId)
  ctx.assert(reporterUser, 422, 'Reporter account has been deleted')
  ctx.assert(
    !(await isUserBlockedOrMuted(currentUser.id, reporterUserId)),
    422,
    'Cannot contact reporter: a block or mute exists between you',
  )
  // Create a private DM between the staff member and the reporter so community
  // moderators cannot discover the reporter's identity via the modmail inbox.
  const conversation = await findOrCreateDirectConversation(currentUser.id, reporterUserId)
  ctx.setStatus(201)
  ctx.json({ conversation })
})

app.route('/api/v1/communities/:idOrSlug/reports/:reportId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'PATCH:/api/v1/communities/:idOrSlug/reports/:reportId',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const reportId = validateUUIDParam(ctx, 'reportId')
  const { community } = await loadCommunityForModerator(currentUser, idOrSlug)
  const body = await parseJsonBody<{ status?: unknown }>(ctx)
  validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug/reports/:reportId', {
    path: ctx.params,
    body,
  })
  const status =
    typeof body.status === 'string' &&
    MODERATION_REPORT_RESOLUTION_STATUSES.includes(body.status as ModerationReportResolutionStatus)
      ? (body.status as ModerationReportResolutionStatus)
      : null
  ctx.assert(status, 422, 'Invalid status')

  const report = await resolveModerationReport(reportId, {
    communityId: community.id,
    resolvedById: currentUser.id,
    status,
  })

  ctx.json({ report: isModerationStaff(currentUser) ? report : redactCommunityReport(report) })
})
