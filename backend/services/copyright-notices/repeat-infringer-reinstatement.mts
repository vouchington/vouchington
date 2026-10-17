import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { isAdminUser } from '@services/users/authorization'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import type { PrivateUser } from '@services/users/types'

export async function recordCopyrightRepeatInfringerReinstatement(
  input: {
    currentUser: PrivateUser
    accountUserId: string
    rationale: string
    recordedAt: Date
  },
  transactionOptions: Parameters<typeof beginTransaction>[0] = {},
): Promise<{ account_user_id: string; outcome: 'reinstatement' }> {
  assert(isAdminUser(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim() && input.rationale.length <= 10_000, 422, 'rationale is required')
  await using transaction = await beginTransaction(transactionOptions)
  await lockAuthorPublicationLifecycle(transaction, input.accountUserId)
  const { rows: blocked } = await transaction<{ id: string }>(sql`
    /* recordCopyrightRepeatInfringerReinstatement */
    SELECT id FROM copyright_repeat_infringer_reviews terminated
    WHERE terminated.account_user_id = ${input.accountUserId}
      AND terminated.outcome = 'terminate'
      AND NOT EXISTS (
        SELECT 1 FROM copyright_repeat_infringer_reviews reinstated
        WHERE reinstated.account_user_id = terminated.account_user_id
          AND reinstated.outcome = 'reinstatement'
          AND reinstated.outcome_at > terminated.outcome_at
      )
    FOR UPDATE
  `)
  assert(blocked[0], 409, 'Copyright termination is not in effect')
  await transaction(sql`
    /* recordCopyrightRepeatInfringerReinstatement:insert */
    INSERT INTO copyright_repeat_infringer_reviews (
      account_user_id, opened_at, outcome, outcome_at, outcome_by_id, rationale_ciphertext
    ) VALUES (
      ${input.accountUserId}, ${input.recordedAt}, 'reinstatement', ${input.recordedAt},
      ${input.currentUser.id},
      ${encryptSecret(
        input.rationale,
        `copyright-repeat-infringer-reinstatement:${input.accountUserId}:${input.recordedAt.toISOString()}`,
      )}
    )
  `)
  await transaction.commit()
  return { account_user_id: input.accountUserId, outcome: 'reinstatement' }
}
