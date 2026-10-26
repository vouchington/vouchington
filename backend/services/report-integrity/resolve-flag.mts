import { recordModeratorAction } from '@services/moderator-actions'
import { runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { FLAG_COLUMNS_WITH_HOSTNAME } from './flag-columns.mts'
import type { ReportIntegrityFlag } from './create-flag.mts'
import type { ReportIntegrityPatchResolution } from '@ts-shared/utils/moderation-catalogs'

export async function resolveReportIntegrityFlag(
  flagId: string,
  resolvedById: string,
  resolution: ReportIntegrityPatchResolution,
  options: { query?: TransactionQuery } = {},
): Promise<ReportIntegrityFlag & { hostname: string | null }> {
  return runWithTransaction(options.query, async (transaction: TransactionQuery) => {
    const query = sql`/* resolveReportIntegrityFlag */
    UPDATE report_integrity_flags
    SET
      resolved_at  = NOW(),
      resolved_by_id = ${resolvedById},
      resolution   = ${resolution}
    WHERE id = ${flagId}
      AND resolved_at IS NULL
    RETURNING`
    query.append(FLAG_COLUMNS_WITH_HOSTNAME)
    const { rows } = await transaction(query)

    const flag = rows[0] as (ReportIntegrityFlag & { hostname: string | null }) | undefined
    if (!flag) throw createHttpError(404, 'Report integrity flag not found or already resolved')
    await recordModeratorAction(
      resolvedById,
      {
        actionType: 'report_integrity_flag_review',
        reportIntegrityFlagId: flagId,
        metadata: { before: { resolution: null }, after: { resolution } },
      },
      { query: transaction },
    )
    return flag
  })
}
