import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Stores one row per answered question. `answers` must already have passed
 * `assertApplicationAnswers`, so every key is an active question id of this community. A key with
 * an `undefined` value is dropped by serialization and gets no row; an explicit `null` is a row.
 */
export async function insertApplicationAnswers(
  applicationId: string,
  communityId: string,
  answers: Record<string, unknown>,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* insertApplicationAnswers */
      INSERT INTO community_application_answers (application_id, community_id, question_id, value)
      SELECT ${applicationId}::uuid, ${communityId}::uuid, answer.key::uuid, answer.value
      FROM jsonb_each(${JSON.stringify(answers)}::jsonb) AS answer`,
    options,
  )
}
