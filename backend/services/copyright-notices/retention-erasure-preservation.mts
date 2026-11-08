import type { TransactionQuery } from '@data-stores/psql'
import { lockAdvisoryKeysInOrder } from './advisory-key-locks.mts'

/** Advisory account locks precede rationale row locks and the caller's fresh eligibility check. */
export async function lockCopyrightRationaleRetentionPage(
  transaction: TransactionQuery,
  ids: readonly string[],
): Promise<ReadonlySet<string>> {
  if (ids.length === 0) return new Set()
  // The caller's bounded page supplies at most batchSize immutable rationale ids. Hold placement
  // takes the same account lock before writing a hold, so its commit precedes the DELETE recheck.
  const accounts = await transaction<{ account_user_id: string }>(
    `/* listCopyrightRationaleRetentionAccounts */
     SELECT DISTINCT COALESCE(rationale.account_user_id, review.account_user_id) AS account_user_id
     FROM copyright_decision_rationales rationale
     LEFT JOIN copyright_repeat_infringer_review_identities review
       ON review.id = rationale.copyright_repeat_infringer_review_identity_id
     WHERE rationale.id = ANY($1::uuid[])
       AND COALESCE(rationale.account_user_id, review.account_user_id) IS NOT NULL
     ORDER BY account_user_id`,
    [ids],
  )
  // One sorted advisory lock per distinct account, taken in the account order of the query above.
  await lockAdvisoryKeysInOrder(
    transaction,
    accounts.rows.map(account => account.account_user_id),
  )
  // Fence party additions before reading held-case scope in the following DELETE statement.
  await transaction(`/* lockCopyrightRationaleRetentionParties */
    LOCK TABLE copyright_notice_thread_party_generations IN SHARE MODE`)
  await transaction(`/* lockCopyrightRationaleRetentionHolds */
    LOCK TABLE user_legal_preservation_holds IN SHARE MODE`)
  const locked = await transaction<{ id: string }>(
    `/* lockCopyrightRationaleRetentionRows */
     SELECT id FROM copyright_decision_rationales
     WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE SKIP LOCKED`,
    [ids],
  )
  return new Set(locked.rows.map(row => row.id))
}
