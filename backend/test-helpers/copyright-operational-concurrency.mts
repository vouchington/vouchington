import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Both writers first hold the case FK lock, exposing an unsafe KEY SHARE to UPDATE upgrade. */
export async function insertConcurrentCopyrightPartySubmissions(
  noticeId: string,
  userIds: readonly [string, string],
): Promise<readonly [string, string]> {
  await using first = await beginTransaction()
  await using second = await beginTransaction()
  await Promise.all(
    [first, second].map(async transaction => {
      await transaction(sql`/* lockConcurrentCopyrightPartyCase */
      SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR KEY SHARE`)
    }),
  )
  const insert = async (transaction: typeof first, userId: string) => {
    const { rows } = await transaction<{
      id: string
    }>(sql`/* insertConcurrentCopyrightPartySubmission */
      INSERT INTO copyright_notice_submissions
        (copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext)
      VALUES (${noticeId}, ${userId}, 'supplement', CURRENT_TIMESTAMP,
        'signed_in_form', ${`v1:concurrent-${randomUUID()}`})
      RETURNING id`)
    await transaction.commit()
    return rows[0]!.id
  }
  const [firstId, secondId] = await Promise.all([
    insert(first, userIds[0]),
    insert(second, userIds[1]),
  ])
  return [firstId, secondId]
}
