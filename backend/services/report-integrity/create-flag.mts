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
  const reporterIds = reporterIdList(details)
  const query = sql`/* createReportIntegrityFlag */
    WITH inserted AS (
      INSERT INTO report_integrity_flags (`
  query.append(fkColumn)
  query.append(sql`, flag_type, reporter_count, new_account_reporter_pct,
      detail_new_account_reporter_count, detail_threshold, detail_window_minutes,
      detail_new_account_age_days)
    VALUES (
      ${entityId}::uuid,
      'mass_report_suspected',
      ${reporterCount},
      ${newAccountReporterPct},
      ${detailNumber(details, 'new_account_reporter_count')},
      ${detailNumber(details, 'threshold')},
      ${detailNumber(details, 'window_minutes')},
      ${detailNumber(details, 'new_account_age_days')}
    )
    ON CONFLICT (`)
  query.append(fkColumn)
  query.append(sql`, flag_type) WHERE resolved_at IS NULL AND `)
  query.append(fkColumn)
  query.append(sql` IS NOT NULL
    DO NOTHING
    RETURNING
      id, post_id, reported_user_id, hostname_id, rss_feed_item_id, flag_type,
      reporter_count, new_account_reporter_pct, detail_new_account_reporter_count,
      detail_threshold, detail_window_minutes, detail_new_account_age_days,
      resolved_at, resolved_by_id, resolution, created_at
    ),
    reporters AS (
      INSERT INTO report_integrity_flag_reporters (flag_id, position, reporter_user_id)
      SELECT inserted.id, item.position::integer - 1, item.reporter_user_id
      FROM inserted
      CROSS JOIN UNNEST(${reporterIds}::uuid[]) WITH ORDINALITY AS item(reporter_user_id, position)
      RETURNING flag_id
    )
    SELECT
      inserted.id,
      inserted.post_id,
      inserted.reported_user_id,
      inserted.hostname_id,
      inserted.rss_feed_item_id,
      inserted.flag_type,
      inserted.reporter_count,
      inserted.new_account_reporter_pct,
      jsonb_strip_nulls(jsonb_build_object(
        'reporter_count', inserted.reporter_count,
        'new_account_reporter_count', inserted.detail_new_account_reporter_count,
        'new_account_reporter_pct', inserted.new_account_reporter_pct,
        'threshold', inserted.detail_threshold,
        'window_minutes', inserted.detail_window_minutes,
        'new_account_age_days', inserted.detail_new_account_age_days,
        'reporter_user_ids', to_jsonb(${reporterIds}::uuid[])
      )) AS details,
      inserted.resolved_at,
      inserted.resolved_by_id,
      inserted.resolution,
      inserted.created_at
    FROM inserted
    LEFT JOIN LATERAL (SELECT count(*) AS n FROM reporters) reporter_rows ON true`)

  const { rows } = await write<ReportIntegrityFlag>(query)
  return rows[0] ?? null
}

function reporterIdList(details: Record<string, unknown>): string[] {
  const value = details.reporter_user_ids
  if (value == null) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error('Invalid report integrity reporter list')
  }
  return value
}

function detailNumber(details: Record<string, unknown>, key: string): number | null {
  if (!Object.hasOwn(details, key)) return null
  const value = details[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid report integrity detail: ${key}`)
  }
  return value
}
