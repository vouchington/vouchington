import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { ENTITY_TYPE_TO_FLAG_FK } from './config.mts'
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
  new_account_reporter_pct: number
  details: Record<string, unknown>
  resolved_at: Date | null
  resolved_by_id: string | null
  resolution: ReportIntegrityResolution | null
  created_at: Date
}

const FLAG_RETURNING = `
  id,
  post_id,
  reported_user_id,
  hostname_id,
  rss_feed_item_id,
  flag_type,
  reporter_count,
  new_account_reporter_pct,
  details,
  resolved_at,
  resolved_by_id,
  resolution,
  created_at`

export async function createReportIntegrityFlag(
  entityType: string,
  entityId: string,
  reporterCount: number,
  newAccountReporterPct: number,
  details: Record<string, unknown>,
): Promise<ReportIntegrityFlag | null> {
  const fkColumn = ENTITY_TYPE_TO_FLAG_FK[entityType]
  if (!fkColumn) throw createHttpError(400, `Unknown entity type: ${entityType}`)

  // Partial unique indexes (idx_rif__*_flag_pending) make ON CONFLICT DO NOTHING atomic,
  // preventing duplicate unresolved flags under concurrent inserts.
  const query = sql`/* createReportIntegrityFlag */
    INSERT INTO report_integrity_flags (`
  query.append(fkColumn)
  query.append(sql`, flag_type, reporter_count, new_account_reporter_pct, details)
    VALUES (${entityId}::uuid, 'mass_report_suspected', ${reporterCount}, ${newAccountReporterPct}, ${JSON.stringify(details)}::jsonb)
    ON CONFLICT (`)
  query.append(fkColumn)
  query.append(sql`, flag_type) WHERE resolved_at IS NULL AND `)
  query.append(fkColumn)
  query.append(sql` IS NOT NULL
    DO NOTHING
    RETURNING`)
  query.append(FLAG_RETURNING)

  const { rows } = await write(query)
  return (rows[0] as ReportIntegrityFlag) ?? null
}
