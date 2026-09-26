/**
 * Moderation-report system/status helpers split out of moderation-reports.mts (concern: the
 * ban-evasion system-user report path and status/escalation reads). Re-exported by
 * moderation-reports.mts so `@voucha/test-helpers` consumers resolve unchanged.
 */

import { read, write } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import sql from 'sql-template-strings'
import { BAN_EVASION_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'
import { openOrGetOpenCase } from './_moderation-case-support.mts'
import { createSystemUser } from './users.mts'

export const ENTITY_TYPE_TO_REPORT_FK: Record<string, string> = {
  post: 'post_id',
  comment: 'post_id',
  user: 'reported_user_id',
  url_hostname: 'hostname_id',
  rss_feed_item: 'rss_feed_item_id',
}

export async function insertTestSystemModerationReport(
  entityType: 'post' | 'comment' | 'user' | 'rss_feed_item' | 'url_hostname',
  entityId: string,
  note?: string,
  createdAt?: Date,
): Promise<string> {
  const fkColumn = ENTITY_TYPE_TO_REPORT_FK[entityType]
  if (!fkColumn) throw new Error(`Unknown entity type: ${entityType}`)
  const caseId = await openOrGetOpenCase({ entityType, entityId })
  const systemUser = await createSystemUser(BAN_EVASION_SYSTEM_USERNAME)
  const reportId = createdAt ? uuidv7({ msecs: createdAt.getTime(), seq: 0 }) : undefined
  const insertQuery = sql`INSERT INTO moderation_reports (`
  if (reportId) insertQuery.append(sql`id, `)
  insertQuery.append(sql`reporter_user_id, `)
  insertQuery.append(fkColumn)
  insertQuery.append(sql`, case_id, reason, original_reason, note, created_via)
    VALUES (`)
  if (reportId) insertQuery.append(sql`${reportId}, `)
  insertQuery.append(sql`${systemUser.id}, ${entityId}::uuid, ${caseId}, 'other', 'other', ${note ?? null}, 'system')
    ON CONFLICT DO NOTHING
    RETURNING id
  `)
  const { rows } = await write<{ id: string }>(insertQuery)
  if (rows[0]) return rows[0].id
  const selectQuery = sql`SELECT id FROM moderation_reports
    WHERE reporter_user_id = ${systemUser.id}
      AND `
  selectQuery.append(fkColumn)
  selectQuery.append(sql` = ${entityId}::uuid
      AND reviewed_at IS NULL
    LIMIT 1
  `)
  const { rows: existing } = await read<{ id: string }>(selectQuery)
  return existing[0]!.id
}

export async function getTestSystemModerationReportStatus(
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const fkColumn = ENTITY_TYPE_TO_REPORT_FK[entityType]
  if (!fkColumn) return null
  const query = sql`SELECT
      CASE
        WHEN mr.reviewed_at IS NULL THEN 'pending'
        ELSE mr.resolution_action::text
      END AS status
    FROM moderation_reports mr
    JOIN users u ON u.id = mr.reporter_user_id
    WHERE `
  query.append(fkColumn)
  query.append(sql` = ${entityId}::uuid
      AND u.username = ${BAN_EVASION_SYSTEM_USERNAME}
    LIMIT 1
  `)
  const { rows } = await read<{ status: string }>(query)
  return rows[0]?.status ?? null
}

export async function getTestModerationReportEscalatedAt(
  reportId: string,
): Promise<Date | null | undefined> {
  const { rows } = await read<{
    escalated_at: Date | null
  }>(sql`/* getTestModerationReportEscalatedAt */
    SELECT escalated_at FROM moderation_reports WHERE id = ${reportId}
  `)
  return rows[0]?.escalated_at
}

export async function getTestModerationReportStatus(reportId: string): Promise<string> {
  const { rows } = await read<{ status: string }>(
    sql`/* getTestModerationReportStatus */
      SELECT CASE WHEN reviewed_at IS NULL THEN 'pending' ELSE resolution_action::text END AS status
      FROM moderation_reports WHERE id = ${reportId}`,
  )
  return rows[0]?.status ?? 'not_found'
}
