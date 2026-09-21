import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function findOutboundCopyrightEmailThreadMatch(references: string[]): Promise<{
  noticeId: string
  matchedIntakeId: null
  matchedReference: string
} | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    noticeId: string
    matchedReference: string
  }>(sql`/* findOutboundCopyrightEmailThreadMatch */
    SELECT copyright_notice_id AS "noticeId",
      trim(BOTH '<>' FROM ses_message_id) AS "matchedReference"
    FROM copyright_notice_delivery_intents
    WHERE channel = 'email' AND state = 'sent' AND ses_message_id IS NOT NULL
      AND trim(BOTH '<>' FROM ses_message_id) = ANY(${references})
    GROUP BY copyright_notice_id, trim(BOTH '<>' FROM ses_message_id)
    ORDER BY copyright_notice_id, "matchedReference"
    LIMIT 2
  `)
  await transaction.commit()
  if (rows.length !== 1) return null
  const row = rows[0]
  if (!row?.matchedReference) return null
  return { ...row, matchedIntakeId: null }
}
