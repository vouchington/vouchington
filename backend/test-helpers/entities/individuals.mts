import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deleteTestIndividual(individualId: string): Promise<void> {
  await write(sql`/* deleteTestIndividual */
    DELETE FROM individuals
    WHERE id = ${individualId}
  `)
}

export async function assignTestRepresentativeIndividual(
  userId: string,
  individualId: string,
): Promise<void> {
  await write(sql`/* assignTestRepresentativeIndividual */
    UPDATE users
    SET individual_id = ${individualId}
    WHERE id = ${userId}
  `)
}

export async function createTestIndividual(): Promise<{ id: string; updated_at: Date }> {
  const { rows } = await write<{ id: string; updated_at: Date }>(sql`/* createTestIndividual */
    INSERT INTO individuals DEFAULT VALUES
    RETURNING id, updated_at
  `)
  return rows[0]!
}
