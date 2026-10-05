import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { ENTITY_TYPE_TO_FLAG_FK } from './config.mts'
import { flagColumns } from './flag-columns.mts'
import type {
  ReportIntegrityFlagType,
  ReportIntegrityResolution,
} from '@ts-shared/utils/moderation-catalogs'
export type {
  ReportIntegrityFlagType,
  ReportIntegrityResolution,
} from '@ts-shared/utils/moderation-catalogs'

export type ReportIntegrityFlag = {
  id: string
  post_id: string | null
  reported_user_id: string | null
  hostname_id: string | null
  rss_feed_item_id: string | null
  flag_type: ReportIntegrityFlagType
  reporter_count: number
  new_account_reporter_percent: number
  details: Record<string, unknown>
  resolved_at: Date | null
  resolved_by_id: string | null
  resolution: ReportIntegrityResolution | null
  created_at: Date
}

/**
 * Insert one unresolved flag and its detection-time reporter set in a single statement. The
 * `users` join skips reporters hard-deleted since detection. `details` must not carry the
 * reporter ids; the returned flag rebuilds `details.reporter_user_ids` from the stored rows.
 */
export async function createReportIntegrityFlag(
  entityType: string,
  entityId: string,
  reporterCount: number,
  newAccountReporterPct: number,
  details: Record<string, unknown>,
  reporterUserIds: string[],
): Promise<ReportIntegrityFlag | null> {
  const fkColumn = ENTITY_TYPE_TO_FLAG_FK[entityType]
  if (!fkColumn) throw createHttpError(400, `Unknown entity type: ${entityType}`)

  // Partial unique indexes (idx_rif__*_flag_pending) make ON CONFLICT DO NOTHING atomic,
  // preventing duplicate unresolved flags under concurrent inserts.
  const query = sql`/* createReportIntegrityFlag */
    WITH inserted AS (
      INSERT INTO report_integrity_flags (`
  query.append(fkColumn)
  query.append(sql`, flag_type, reporter_count, new_account_reporter_percent, details)
      VALUES (${entityId}::uuid, 'mass_report_suspected', ${reporterCount}, ${newAccountReporterPct}, ${JSON.stringify(details)}::jsonb)
      ON CONFLICT (`)
  query.append(fkColumn)
  query.append(sql`, flag_type) WHERE resolved_at IS NULL AND `)
  query.append(fkColumn)
  query.append(sql` IS NOT NULL
      DO NOTHING
      RETURNING *
    ), inserted_reporters AS (
      INSERT INTO report_integrity_flag_reporters (flag_id, user_id)
      SELECT DISTINCT inserted.id, reporter.id
      FROM inserted
      CROSS JOIN unnest(${reporterUserIds}::uuid[]) AS reporter(id)
      JOIN users ON users.id = reporter.id
      ORDER BY reporter.id
      RETURNING flag_id, user_id
    )
    SELECT`)
  query.append(flagColumns('inserted', 'inserted_reporters'))
  query.append(sql`
    FROM inserted`)

  const { rows } = await write(query)
  return (rows[0] as ReportIntegrityFlag) ?? null
}
