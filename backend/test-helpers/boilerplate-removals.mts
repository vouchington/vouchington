import { write } from './fixture-executor.mts'
import sql from './fixture-sql.mts'

export async function deleteTestBoilerplateRemovalsForHostname(hostnameId: string): Promise<void> {
  await write(
    sql`/* deleteTestBoilerplateRemovalsForHostname */
      DELETE FROM hostname_path_boilerplate_removals WHERE hostname_id = ${hostnameId}`,
  )
}
