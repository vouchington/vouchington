import { write } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { ReportIntegrityFlag } from './create-flag.mts'
import type { ReportIntegrityPatchResolution } from '@ts-shared/utils/moderation-catalogs'

export async function resolveReportIntegrityFlag(
  flagId: string,
  resolvedById: string,
  resolution: ReportIntegrityPatchResolution,
): Promise<ReportIntegrityFlag> {
  const { rows } = await write(sql`/* resolveReportIntegrityFlag */
    UPDATE report_integrity_flags
    SET
      resolved_at  = NOW(),
      resolved_by_id = ${resolvedById},
      resolution   = ${resolution}
    WHERE id = ${flagId}
      AND resolved_at IS NULL
    RETURNING
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
      created_at
  `)

  const flag = rows[0] as ReportIntegrityFlag | undefined
  if (!flag) throw createHttpError(404, 'Report integrity flag not found or already resolved')
  return flag
}
