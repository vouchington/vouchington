import { getMaxUUIDv7ForDate } from '@modules/utils'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deleteTestBoilerplateRemovalsForHostname(hostnameId: string): Promise<void> {
  await write(
    sql`/* deleteTestBoilerplateRemovalsForHostname */
      DELETE FROM hostname_path_boilerplate_removals WHERE hostname_id = ${hostnameId}`,
  )
}

export async function setTestBoilerplateRemovalIdAt(removalId: string, at: Date): Promise<void> {
  const id = getMaxUUIDv7ForDate(at)
  await write(sql`/* setTestBoilerplateRemovalIdAt */
    UPDATE hostname_path_boilerplate_removals SET id = ${id} WHERE id = ${removalId}`)
}

export async function setTestBoilerplateRemovalHostnameCursor(
  hostnameId: string | null,
): Promise<void> {
  await write(sql`/* setTestBoilerplateRemovalHostnameCursor */
    INSERT INTO boilerplate_removal_hostname_cursors (is_singleton, cursor_hostname_id)
    VALUES (TRUE, ${hostnameId}::uuid)
    ON CONFLICT (is_singleton) DO UPDATE SET cursor_hostname_id = EXCLUDED.cursor_hostname_id`)
}

export async function getTestBoilerplateRemovalHostnameCursor(): Promise<string | null> {
  const { rows } = await write<{ cursor_hostname_id: string | null }>(
    sql`/* getTestBoilerplateRemovalHostnameCursor */
      SELECT cursor_hostname_id FROM boilerplate_removal_hostname_cursors WHERE is_singleton`,
  )
  return rows[0]?.cursor_hostname_id ?? null
}

/** Positions the sweep so its next batch starts exactly at the given hostname. */
export async function setTestBoilerplateRemovalHostnameCursorBefore(
  hostnameId: string,
): Promise<void> {
  await write(sql`/* setTestBoilerplateRemovalHostnameCursorBefore */
    INSERT INTO boilerplate_removal_hostname_cursors (is_singleton, cursor_hostname_id)
    VALUES (TRUE, (SELECT id FROM url_hostnames WHERE id < ${hostnameId}::uuid ORDER BY id DESC LIMIT 1))
    ON CONFLICT (is_singleton) DO UPDATE SET cursor_hostname_id = EXCLUDED.cursor_hostname_id`)
}
