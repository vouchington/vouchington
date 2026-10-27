import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { HostnameBlockCleanupPosition } from './cleanup-operation.mts'
import { resumeCursor } from './cleanup-operation-progress.mts'

// Recovery decides where a lost job resumes, so it reads the primary: a lagging replica would
// restart the cleanup from a stale stage.
export async function searchPendingHostnameBlockCleanups(
  afterBlockId: string | undefined,
  limit: number,
): Promise<HostnameBlockCleanupPosition[]> {
  const statement = sql`/* searchPendingHostnameBlockCleanups */
    SELECT id AS "blockId", relation_cleanup_progress AS progress,
      relation_cleanup_stage AS stage, relation_cleanup_resume_after AS "resumeAfter"
    FROM url_hostname_blocks
    WHERE relation_cleanup_root_block_id = id
      AND relation_cleanup_completed_at IS NULL`
  if (afterBlockId) statement.append(sql` AND id > ${afterBlockId}`)
  statement.append(sql` ORDER BY id LIMIT ${limit}`)
  const { rows } = await write<{
    blockId: string
    progress: number
    stage: 'subdomains' | 'relations' | 'penalties'
    resumeAfter: string | null
  }>(statement)
  return rows.map(row => ({
    blockId: row.blockId,
    progress: row.progress,
    cursor: resumeCursor(row),
  }))
}
