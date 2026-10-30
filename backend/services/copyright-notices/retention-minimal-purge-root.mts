import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { readCopyrightMinimalPurgePhysicalRows } from './retention-minimal-purge-deletions.mts'
import {
  COPYRIGHT_MINIMAL_PURGE_MAX_TERMINAL_ROWS,
  type CopyrightMinimalPurgePageResult,
} from './retention-minimal-purge-types.mts'

/** Caller has proved the fixed tail; the root trigger repeats authorization and graph checks. */
export async function deleteCopyrightMinimalPurgeRoot(
  query: TransactionQuery,
  noticeId: string,
  remainingPhysicalRows: number,
): Promise<CopyrightMinimalPurgePageResult> {
  if (remainingPhysicalRows < COPYRIGHT_MINIMAL_PURGE_MAX_TERMINAL_ROWS)
    return {
      outcome: 'progress',
      physicalRows: 0,
      requiredRows: COPYRIGHT_MINIMAL_PURGE_MAX_TERMINAL_ROWS,
    }
  // The root guard repeats both checks atomically before its fixed marker cascade.
  const result = await query(sql`/* purgeCopyrightMinimalRecord */
    DELETE FROM copyright_notices WHERE id = ${noticeId}`)
  if (result.rowCount !== 1) return { outcome: 'ineligible', physicalRows: 0 }
  await query(sql`/* recordCopyrightMinimalPurgeRootRemoval */
    UPDATE copyright_notice_minimal_purge_continuations
    SET root_purged_at = CURRENT_TIMESTAMP
    WHERE copyright_notice_identity_id = ${noticeId} AND root_purged_at IS NULL`)
  const physicalRows = await readCopyrightMinimalPurgePhysicalRows(query)
  return { outcome: 'progress', physicalRows }
}
