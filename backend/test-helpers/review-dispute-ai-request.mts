import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Reads the private request token so real-PG tests can execute an admitted dispute job. */
export async function getReviewDisputeAiRequestToken(disputeId: string): Promise<string> {
  const { rows } = await write<{ ai_draft_request_token: string }>(sql`
    /* getReviewDisputeAiRequestToken */
    SELECT ai_draft_request_token FROM review_disputes WHERE id = ${disputeId}
  `)
  if (!rows[0]) throw new Error('Expected dispute draft request')
  return rows[0].ai_draft_request_token
}
