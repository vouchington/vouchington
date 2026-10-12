import { write } from './fixture-executor.mts'
import sql from './fixture-sql.mts'

/** Read only one actor's own replay claim after an import fails before its response exists. */
export async function getTopicImportFailureStateForTest(userId: string, idempotencyKey: string) {
  const { rows } = await write<{ response: unknown; completed_at: Date | null }>(
    sql`/* getTopicImportFailureStateForTest */
      SELECT response, completed_at
      FROM user_topic_import_attempts
      WHERE user_id = ${userId} AND idempotency_key = ${idempotencyKey}`,
  )
  return rows[0] ?? null
}
