import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import {
  ENTITY_TYPE_TO_FLAG_FK,
  MASS_REPORT_THRESHOLD,
  MASS_REPORT_WINDOW_MINUTES,
  NEW_ACCOUNT_AGE_DAYS,
} from './config.mts'

export type MassReportCampaignResult = {
  flagged: boolean
  reporter_count: number
  new_account_reporter_pct: number
  details: {
    reporter_count: number
    new_account_reporter_count: number
    new_account_reporter_pct: number
    threshold: number
    window_minutes: number
    new_account_age_days: number
    /**
     * The exact reporters that formed this flag, captured at detection time. The
     * penalty path penalizes precisely this set, so later/unrelated reports on the
     * same entity are never swept in and resolved reports are never dropped.
     */
    reporter_user_ids: string[]
  }
}

/**
 * Detect whether an entity has received a suspicious number of pending reports
 * within the window, especially from newly-created accounts.
 *
 * Note: reads moderation_reports directly (same DB schema) to avoid a circular
 * service dependency (@services/moderation-reports would need @services/report-integrity).
 */
export async function detectMassReportCampaign(
  entityType: string,
  entityId: string,
): Promise<MassReportCampaignResult> {
  const empty: MassReportCampaignResult = {
    flagged: false,
    reporter_count: 0,
    new_account_reporter_pct: 0,
    details: {
      reporter_count: 0,
      new_account_reporter_count: 0,
      new_account_reporter_pct: 0,
      threshold: MASS_REPORT_THRESHOLD,
      window_minutes: MASS_REPORT_WINDOW_MINUTES,
      new_account_age_days: NEW_ACCOUNT_AGE_DAYS,
      reporter_user_ids: [],
    },
  }

  const fkColumn = ENTITY_TYPE_TO_FLAG_FK[entityType]
  if (!fkColumn) return empty

  const windowStart = new Date(Date.now() - MASS_REPORT_WINDOW_MINUTES * 60 * 1000)
  const windowStartId = getMinUUIDv7ForDate(windowStart)
  // User IDs are UUIDv7 — use id comparison for account-age filtering.
  const youngAccountCutoff = new Date(Date.now() - NEW_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000)
  const youngAccountCutoffId = getMinUUIDv7ForDate(youngAccountCutoff)

  const query = sql`/* detectMassReportCampaign */
    SELECT
      array_agg(DISTINCT r.reporter_user_id) AS reporter_user_ids,
      COUNT(DISTINCT r.reporter_user_id)::int AS reporter_count,
      COUNT(DISTINCT r.reporter_user_id) FILTER (WHERE u.id >= ${youngAccountCutoffId})::int
        AS new_account_reporter_count
    FROM moderation_reports r
    JOIN users u ON u.id = r.reporter_user_id AND u.deleted_at IS NULL
    WHERE r.`
  query.append(fkColumn)
  query.append(sql` = ${entityId}::uuid
      AND r.id >= ${windowStartId}
      AND r.reviewed_at IS NULL
  `)

  const { rows } = await read(query)
  const row = rows[0] as
    | {
        reporter_user_ids: string[] | null
        reporter_count: number
        new_account_reporter_count: number
      }
    | undefined
  const reporterUserIds = row?.reporter_user_ids ?? []
  const reporterCount = row?.reporter_count ?? 0
  const newAccountReporterCount = row?.new_account_reporter_count ?? 0
  const newAccountReporterPct = reporterCount > 0 ? newAccountReporterCount / reporterCount : 0

  return {
    flagged: reporterCount >= MASS_REPORT_THRESHOLD,
    reporter_count: reporterCount,
    new_account_reporter_pct: newAccountReporterPct,
    details: {
      reporter_count: reporterCount,
      new_account_reporter_count: newAccountReporterCount,
      new_account_reporter_pct: newAccountReporterPct,
      threshold: MASS_REPORT_THRESHOLD,
      window_minutes: MASS_REPORT_WINDOW_MINUTES,
      new_account_age_days: NEW_ACCOUNT_AGE_DAYS,
      reporter_user_ids: reporterUserIds,
    },
  }
}
