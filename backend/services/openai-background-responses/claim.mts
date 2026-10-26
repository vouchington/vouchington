import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Idempotent cleanup after accounting or a confirmed terminal response without usage. */
export async function deleteBackgroundResponseRegistration(
  responseId: string,
  query: QueryExecutor = write,
): Promise<void> {
  await query(sql`/* deleteBackgroundResponseRegistration */
    DELETE FROM openai_background_responses WHERE response_id = ${responseId}
  `)
}
