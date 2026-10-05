import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deleteTestBoilerplateRemovalsForHostname(hostnameId: string): Promise<void> {
  await write(
    sql`/* deleteTestBoilerplateRemovalsForHostname */
      DELETE FROM hostname_path_boilerplate_removals WHERE hostname_id = ${hostnameId}`,
  )
}
