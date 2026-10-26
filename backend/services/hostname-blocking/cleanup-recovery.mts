import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { HostnameBlockCleanupPosition } from './cleanup-operation.mts'

export async function searchPendingHostnameBlockCleanups(
  afterBlockId: string | undefined,
  limit: number,
): Promise<HostnameBlockCleanupPosition[]> {
  const statement = sql`/* searchPendingHostnameBlockCleanups */
    SELECT id AS "blockId", relation_cleanup_progress AS progress
    FROM url_hostname_blocks
    WHERE relation_cleanup_root_block_id = id
      AND relation_cleanup_completed_at IS NULL`
  if (afterBlockId) statement.append(sql` AND id > ${afterBlockId}`)
  statement.append(sql` ORDER BY id LIMIT ${limit}`)
  const { rows } = await read<HostnameBlockCleanupPosition>(statement)
  return rows
}
