import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deleteTestIndividual(individualId: string): Promise<void> {
  await write(sql`/* deleteTestIndividual */
    DELETE FROM individuals
    WHERE id = ${individualId}
  `)
}
