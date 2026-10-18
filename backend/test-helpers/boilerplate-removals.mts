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
