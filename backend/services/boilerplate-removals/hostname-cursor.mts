import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type BoilerplateHostnameBatch = {
  hostnameIds: string[]
  previousCursor: string | null
  /** The last hostname of a full batch, or null when this batch reaches the end and the sweep wraps. */
  nextCursor: string | null
}

/** Takes the next `batchSize` hostnames by id after the persisted cursor. */
export async function readBoilerplateHostnameBatch(
  batchSize: number,
): Promise<BoilerplateHostnameBatch> {
  await write(sql`/* ensureBoilerplateRemovalHostnameCursor */
    INSERT INTO boilerplate_removal_hostname_cursors (is_singleton)
    VALUES (TRUE) ON CONFLICT DO NOTHING`)
  const { rows: cursorRows } = await write<{ cursor_hostname_id: string | null }>(
    sql`/* readBoilerplateRemovalHostnameCursor */
      SELECT cursor_hostname_id FROM boilerplate_removal_hostname_cursors WHERE is_singleton`,
  )
  const previousCursor = cursorRows[0]!.cursor_hostname_id
  const { rows } = await read<{ id: string }>(sql`/* listBoilerplateRemovalHostnameBatch */
    SELECT id FROM url_hostnames
    WHERE id > COALESCE(${previousCursor}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY id
    LIMIT ${batchSize + 1}
  `)
  const hostnameIds = rows.slice(0, batchSize).map(row => row.id)
  return {
    hostnameIds,
    previousCursor,
    nextCursor: rows.length > batchSize ? rows[batchSize - 1]!.id : null,
  }
}

/** Compare-and-set advance; returns false when another run already moved the cursor. */
export async function advanceBoilerplateHostnameCursor(
  batch: BoilerplateHostnameBatch,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* advanceBoilerplateRemovalHostnameCursor */
    UPDATE boilerplate_removal_hostname_cursors
    SET cursor_hostname_id = ${batch.nextCursor}::uuid
    WHERE is_singleton
      AND cursor_hostname_id IS NOT DISTINCT FROM ${batch.previousCursor}::uuid
  `)
  return rowCount === 1
}
