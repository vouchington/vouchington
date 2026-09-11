import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { caseEntityFkColumn, type ModerationCase, type ModerationCaseEntity } from './config.mts'

export async function getCaseById(caseId: string): Promise<ModerationCase | null> {
  const { rows } = await read<ModerationCase>(
    sql`/* getCaseById */
    SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id,
           uuid_extract_timestamp(id) AS created_at, updated_at, resolved_at, resolved_by_id
    FROM moderation_cases
    WHERE id = ${caseId}
    LIMIT 1
  `,
  )
  return rows[0] ?? null
}

export interface ModerationCaseTrace {
  case: ModerationCase
  reports: Array<{
    id: string
    reason: string
    note: string | null
    status: string
    created_at: Date
  }>
  judgements: Array<{
    id: string
    recommended_action: string
    created_at: Date
  }>
  warnings: Array<{ id: string; reason: string; revoked_at: Date | null; created_at: Date }>
  bans: Array<{
    id: string
    community_id: string
    reason: string | null
    lifted_at: Date | null
    created_at: Date
  }>
  appeals: Array<{
    id: string
    status: string
    appeal_reason: string
    resolution_action: string | null
    created_at: Date
  }>
}

export async function getCaseTrace(caseId: string): Promise<ModerationCaseTrace | null> {
  const { rows: caseRows } = await read<ModerationCase>(
    sql`/* getCaseTrace:case */
    SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id,
           uuid_extract_timestamp(id) AS created_at, updated_at, resolved_at, resolved_by_id
    FROM moderation_cases
    WHERE id = ${caseId}
    LIMIT 1
  `,
  )
  const caseRow = caseRows[0]
  if (!caseRow) return null

  const [reportRows, judgementRows, warningRows, banRows, appealRows] = await Promise.all([
    read<ModerationCaseTrace['reports'][number]>(
      sql`/* getCaseTrace:reports */
      SELECT
        id,
        reason,
        note,
        CASE
          WHEN reviewed_at IS NULL THEN 'pending'
          ELSE resolution_action::text
        END AS status,
        created_at
      FROM moderation_reports
      WHERE case_id = ${caseId}
      ORDER BY id ASC
    `,
    ),
    read<ModerationCaseTrace['judgements'][number]>(
      sql`/* getCaseTrace:judgements */
      SELECT id, recommended_action, created_at
      FROM moderation_report_judgements
      WHERE case_id = ${caseId}
      ORDER BY id ASC
    `,
    ),
    read<ModerationCaseTrace['warnings'][number]>(
      sql`/* getCaseTrace:warnings */
      SELECT id, reason, revoked_at, created_at
      FROM user_warnings
      WHERE case_id = ${caseId}
      ORDER BY id ASC
    `,
    ),
    read<ModerationCaseTrace['bans'][number]>(
      sql`/* getCaseTrace:bans */
      SELECT id, community_id, reason, lifted_at, uuid_extract_timestamp(id) AS created_at
      FROM community_bans
      WHERE case_id = ${caseId}
      ORDER BY id ASC
    `,
    ),
    read<ModerationCaseTrace['appeals'][number]>(
      sql`/* getCaseTrace:appeals */
      SELECT
        id,
        CASE
          WHEN resolved_at IS NULL THEN 'pending'
          WHEN resolution_action = 'deny' THEN 'dismissed'
          ELSE 'resolved'
        END AS status,
        appeal_reason,
        resolution_action,
        uuid_extract_timestamp(id) AS created_at
      FROM moderation_appeals
      WHERE case_id = ${caseId}
      ORDER BY id ASC
    `,
    ),
  ])

  return {
    case: caseRow,
    reports: reportRows.rows,
    judgements: judgementRows.rows,
    warnings: warningRows.rows,
    bans: banRows.rows,
    appeals: appealRows.rows,
  }
}

export async function findMostRecentCaseForEntity(
  entity: ModerationCaseEntity,
): Promise<ModerationCase | null> {
  const fkColumn = caseEntityFkColumn(entity.entityType)
  const query = sql`/* findMostRecentCaseForEntity */ SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id, uuid_extract_timestamp(id) AS created_at, updated_at, resolved_at, resolved_by_id FROM moderation_cases WHERE `
  query.append(fkColumn)
  query.append(sql` = ${entity.entityId}::uuid ORDER BY id DESC LIMIT 1`)
  const { rows } = await read<ModerationCase>(query)
  return rows[0] ?? null
}
