import type { TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'

export async function insertModerationJudgementForRetentionTest(
  query: TransactionQuery,
  options: { id: string; reportedUserId?: string; postId?: string; dispatchedAt: Date },
): Promise<void> {
  await query(
    `/* insertModerationJudgementForRetentionTest */
      INSERT INTO moderation_report_judgements
        (id, reported_user_id, post_id, recommended_action,
         public_response, internal_response, model, dispatched_at)
      VALUES ($1, $2, $3, 'warn', 'Preserved public outcome',
        'Preserved private rationale', 'test', $4)`,
    [options.id, options.reportedUserId ?? null, options.postId ?? null, options.dispatchedAt],
  )
}

export async function placeJudgementAccountHoldForRetentionTest(
  query: TransactionQuery,
  accountUserId: string,
): Promise<void> {
  await query(
    `/* placeJudgementAccountHoldForRetentionTest */
      INSERT INTO user_legal_preservation_holds
        (id, account_user_id, placed_by_id, reference_ciphertext)
      VALUES ($1, $2, $2, 'synthetic-judgement-retention-hold')`,
    [v7(), accountUserId],
  )
}

export async function releaseJudgementAccountHoldForRetentionTest(
  query: TransactionQuery,
  accountUserId: string,
): Promise<void> {
  await query(
    `/* releaseJudgementAccountHoldForRetentionTest */
      UPDATE user_legal_preservation_holds
      SET released_at = CURRENT_TIMESTAMP, released_by_id = $1::uuid
      WHERE account_user_id = $1::uuid AND released_at IS NULL`,
    [accountUserId],
  )
}

export async function moderationJudgementForRetentionTest(query: TransactionQuery, id: string) {
  const { rows } = await query<{ internal_response: string; recommended_action: string }>(
    `/* moderationJudgementForRetentionTest */
      SELECT internal_response, recommended_action::text
      FROM moderation_report_judgements WHERE id = $1::uuid`,
    [id],
  )
  return rows[0]
}
