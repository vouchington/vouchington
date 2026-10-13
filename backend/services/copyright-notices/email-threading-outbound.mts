import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

type OutboundCopyrightEmailThreadMatch = {
  noticeId: string
  matchedIntakeId: null
  matchedReference: string
}

export async function findOutboundCopyrightEmailThreadMatch(
  references: string[],
  transaction?: TransactionQuery,
): Promise<OutboundCopyrightEmailThreadMatch | null> {
  if (transaction) return readOutboundCopyrightEmailThreadMatch(references, transaction)
  await using owned = await beginTransaction()
  const match = await readOutboundCopyrightEmailThreadMatch(references, owned)
  await owned.commit()
  return match
}

async function readOutboundCopyrightEmailThreadMatch(
  references: string[],
  transaction: TransactionQuery,
): Promise<OutboundCopyrightEmailThreadMatch | null> {
  const { rows } = await transaction<{
    noticeId: string
    matchedReference: string
  }>(sql`/* findOutboundCopyrightEmailThreadMatch */
    SELECT copyright_notice_id AS "noticeId",
      trim(BOTH '<>' FROM amazon_ses_message_id) AS "matchedReference"
    FROM copyright_notice_delivery_work_items
    WHERE channel = 'email' AND state = 'sent' AND amazon_ses_message_id IS NOT NULL
      AND copyright_notice_id IS NOT NULL
      AND trim(BOTH '<>' FROM amazon_ses_message_id) = ANY(${references})
    GROUP BY copyright_notice_id, trim(BOTH '<>' FROM amazon_ses_message_id)
    ORDER BY copyright_notice_id, "matchedReference"
    LIMIT 2
  `)
  if (rows.length !== 1) return null
  const row = rows[0]
  if (!row?.matchedReference) return null
  return { ...row, matchedIntakeId: null }
}
