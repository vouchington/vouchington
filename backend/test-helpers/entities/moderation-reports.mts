import { read, write } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import sql from 'sql-template-strings'
import type { ModerationJudgementAction } from '@ts-shared/utils/moderation-policy'
import type { ModerationReportReason } from '@ts-shared/utils/moderation-reports'
import { openOrGetOpenCase } from './_moderation-case-support.mts'
import { getTestReportJudgementContext } from './_moderation-report-judgement-context.mts'
import {
  ENTITY_TYPE_TO_REPORT_FK,
  insertTestSystemModerationReport,
  getTestSystemModerationReportStatus,
  getTestModerationReportEscalatedAt,
  getTestModerationReportStatus,
} from './moderation-report-status.mts'
// Re-export status helpers so existing test-helper import paths remain stable.
export {
  ENTITY_TYPE_TO_REPORT_FK,
  insertTestSystemModerationReport,
  getTestSystemModerationReportStatus,
  getTestModerationReportEscalatedAt,
  getTestModerationReportStatus,
}
export async function insertTestModerationReport(options: {
  reporterUserId: string
  entityType: 'post' | 'comment' | 'user' | 'rss_feed_item' | 'url_hostname'
  entityId: string
  reason?: ModerationReportReason
  note?: string
  createdAt?: Date
  communityId?: string
}): Promise<string> {
  const fkColumn = ENTITY_TYPE_TO_REPORT_FK[options.entityType]
  if (!fkColumn) throw new Error(`Unknown entity type: ${options.entityType}`)

  const caseId = await openOrGetOpenCase({
    entityType: options.entityType,
    entityId: options.entityId,
  })
  const reportId = options.createdAt
    ? uuidv7({ msecs: options.createdAt.getTime(), seq: 0 })
    : undefined
  const query = sql`INSERT INTO moderation_reports (`
  if (reportId) query.append(sql`id, `)
  query.append(sql`reporter_user_id, `)
  query.append(fkColumn)
  query.append(sql`, case_id, reason, original_reason, moderation_transparency_community_id, note)
    VALUES (
      `)
  if (reportId) query.append(sql`${reportId}, `)
  query.append(sql`
      ${options.reporterUserId},
      ${options.entityId}::uuid,
      ${caseId},
      ${options.reason ?? 'spam'},
      ${options.reason ?? 'spam'},
      ${options.communityId ?? null},
      ${options.note ?? null}
    )
    RETURNING id
  `)
  const { rows } = await write<{ id: string }>(query)
  return rows[0]!.id
}
export async function getTestModerationReportTransparencyCommunityId(
  reportedUserId: string,
): Promise<string | null | undefined> {
  const { rows } = await read<{ moderation_transparency_community_id: string | null }>(sql`
    SELECT moderation_transparency_community_id
    FROM moderation_reports
    WHERE reported_user_id = ${reportedUserId}::uuid
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0]?.moderation_transparency_community_id
}

export async function getTestModerationReportCaseId(reportId: string): Promise<string> {
  const { rows } = await read<{ case_id: string }>(
    sql`/* getTestModerationReportCaseId */ SELECT case_id FROM moderation_reports WHERE id = ${reportId}::uuid LIMIT 1`,
  )
  const caseId = rows[0]?.case_id
  if (!caseId) throw new Error(`Moderation report ${reportId} has no case`)
  return caseId
}

export async function updateTestModerationReportReason(
  reportId: string,
  reason: ModerationReportReason,
): Promise<void> {
  await write(sql`/* updateTestModerationReportReason */
    UPDATE moderation_reports
    SET reason = ${reason}
    WHERE id = ${reportId}::uuid
  `)
}

export async function updateTestModerationReportOriginalReason(
  reportId: string,
  reason: ModerationReportReason,
): Promise<void> {
  await write(sql`/* updateTestModerationReportOriginalReason */
    UPDATE moderation_reports
    SET original_reason = ${reason}
    WHERE id = ${reportId}::uuid
  `)
}

export async function insertTestModerationReportsForTarget(options: {
  reporterUserIds: string[]
  entityType: 'post' | 'comment' | 'user' | 'rss_feed_item' | 'url_hostname'
  entityId: string
  reason?: ModerationReportReason
  createdAt?: Date
}): Promise<string[]> {
  if (options.reporterUserIds.length === 0) return []
  const fkColumn = ENTITY_TYPE_TO_REPORT_FK[options.entityType]
  if (!fkColumn) throw new Error(`Unknown entity type: ${options.entityType}`)

  const caseId = await openOrGetOpenCase({
    entityType: options.entityType,
    entityId: options.entityId,
  })
  const createdAt = options.createdAt
  const reportIds: Array<string | null> = createdAt
    ? options.reporterUserIds.map((_, index) => uuidv7({ msecs: createdAt.getTime(), seq: index }))
    : options.reporterUserIds.map(() => null)
  const query = sql`
    WITH input(reporter_user_id, report_id, ord) AS (
      SELECT reporter_user_id, report_id, ord
      FROM unnest(${options.reporterUserIds}::uuid[], ${reportIds}::uuid[]) WITH ORDINALITY AS input(reporter_user_id, report_id, ord)
    )
    INSERT INTO moderation_reports (`
  if (options.createdAt) query.append(sql`id, `)
  query.append(sql`reporter_user_id, `)
  query.append(fkColumn)
  query.append(sql`, case_id, reason, original_reason)
    SELECT `)
  if (options.createdAt) query.append(sql`report_id, `)
  query.append(sql`reporter_user_id, ${options.entityId}::uuid, ${caseId}, ${options.reason ?? 'spam'}, ${options.reason ?? 'spam'}
    FROM input
    ORDER BY ord
    RETURNING id, reporter_user_id
  `)
  const { rows } = await write<{ id: string; reporter_user_id: string }>(query)
  const idByReporterUserId = new Map(rows.map(row => [row.reporter_user_id, row.id]))
  return options.reporterUserIds.map(reporterUserId => idByReporterUserId.get(reporterUserId)!)
}

export async function insertTestReportJudgement(options: {
  entityType: 'post' | 'comment' | 'user' | 'rss_feed_item' | 'url_hostname'
  entityId: string
  triggeringReportId?: string | null
  recommendedAction?: ModerationJudgementAction
  publicResponse?: string
  internalResponse?: string
}): Promise<string> {
  const fkColumn = ENTITY_TYPE_TO_REPORT_FK[options.entityType]
  if (!fkColumn) throw new Error(`Unknown entity type: ${options.entityType}`)

  const triggeringReportId =
    options.triggeringReportId === undefined ? null : options.triggeringReportId

  let caseId: string | null = null
  if (triggeringReportId) {
    const { rows: reportRows } = await read<{ case_id: string | null }>(
      sql`/* insertTestReportJudgement:caseId */ SELECT case_id FROM moderation_reports WHERE id = ${triggeringReportId}::uuid LIMIT 1`,
    )
    caseId = reportRows[0]?.case_id ?? null
  }
  if (!caseId) {
    caseId = await openOrGetOpenCase({
      entityType: options.entityType,
      entityId: options.entityId,
    })
  }

  const context = await getTestReportJudgementContext(fkColumn, options.entityId)

  const query = sql`/* insertTestReportJudgement */ INSERT INTO moderation_report_judgements (`
  query.append(fkColumn)
  query.append(
    sql`, case_id, triggering_report_id, recommended_action, public_response, internal_response, model, context_hash, context_report_count, context_note_hash, context_max_reason_rank)
    VALUES (
      ${options.entityId}::uuid,
      ${caseId},
      ${triggeringReportId},
      ${options.recommendedAction ?? 'no_action'},
      ${options.publicResponse ?? 'No action required at this time.'},
      ${options.internalResponse ?? 'Content appears to comply with community guidelines.'},
      'test',
      ${context.contextHash},
      ${context.reportCount},
      ${context.noteHash},
      ${context.maxReasonRank}
    )
    RETURNING id`,
  )
  const { rows } = await write<{ id: string }>(query)
  return rows[0]!.id
}
