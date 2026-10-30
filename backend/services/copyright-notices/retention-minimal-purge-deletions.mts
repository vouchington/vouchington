import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CopyrightMinimalPurgePhase } from './retention-minimal-purge-types.mts'

export async function readCopyrightMinimalPurgePhysicalRows(
  query: TransactionQuery,
): Promise<number> {
  const { rows } = await query<{ deleted: number }>(sql`/* readCopyrightMinimalPurgePhysicalRows */
    SELECT COALESCE(NULLIF(current_setting('app.copyright_minimal_purge_physical_count', true), ''), '0')::integer AS deleted`)
  return rows[0]?.deleted ?? 0
}

/** Read the physical trigger count in a fresh statement, after every DELETE/CASCADE has run. */
export async function deleteCopyrightMinimalPurgePhasePage(
  query: TransactionQuery,
  phase: CopyrightMinimalPurgePhase,
  noticeId: string,
  pageSize: number,
  cursor: string | null,
): Promise<{ scanned: number; deleted: number; physicalRows: number; lastId: string | null }> {
  const { rows } = await query<{ scanned: number; deleted: number; last_id?: string | null }>(
    phase.statement(noticeId, pageSize, cursor),
  )
  const page = rows[0]
  const physicalRows = await readCopyrightMinimalPurgePhysicalRows(query)
  if (
    !page ||
    page.scanned > pageSize + 1 ||
    page.deleted > pageSize ||
    physicalRows < page.deleted ||
    physicalRows > pageSize * (phase.maxPhysicalRowsPerParent ?? 1) ||
    (page.scanned > 0 && page.deleted === 0 && !phase.scanCursor)
  )
    throw new Error(`Copyright minimal purge page failed for ${phase.table}`)
  return { ...page, physicalRows, lastId: page.last_id ?? null }
}
