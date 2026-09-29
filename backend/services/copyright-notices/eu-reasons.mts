import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { assertBoundedText } from './territorial-fields.mts'
import { lockCurrentCopyrightTerritorialPolicy } from './territorial-policy.mts'

export type EuCopyrightStatementOfReasons = {
  id: string
  decided_at: Date
  automation_disclosure: 'human'
}

export async function recordEuCopyrightStatementOfReasons(
  actor: PrivateUser,
  noticeId: string,
  statement: string,
): Promise<EuCopyrightStatementOfReasons> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  const text = assertBoundedText(statement, 50_000, 'statement is required')
  await using transaction = await beginTransaction()
  const { rows: receipts } = await transaction<{ id: string }>(
    sql`/* recordEuCopyrightStatementOfReasons:receipt */
    SELECT id FROM copyright_eu_notice_receipts WHERE copyright_notice_id = ${noticeId}
  `,
  )
  assert(receipts[0], 404, 'EU copyright notice not found')
  const { rows: existing } = await transaction<{ id: string }>(
    sql`/* recordEuCopyrightStatementOfReasons:existing */
    SELECT id FROM copyright_eu_statements_of_reasons WHERE copyright_notice_id = ${noticeId}
  `,
  )
  assert(!existing[0], 409, 'A statement of reasons already exists')
  await lockCurrentCopyrightTerritorialPolicy('eu_dsa', transaction)
  const { rows } = await transaction<EuCopyrightStatementOfReasons>(
    sql`/* recordEuCopyrightStatementOfReasons */
    INSERT INTO copyright_eu_statements_of_reasons (
      copyright_notice_id, decided_by_id, automation_disclosure, statement_ciphertext
    ) VALUES (
      ${noticeId}, ${actor.id}, 'human',
      ${encryptSecret(text, `copyright-eu-statement:${noticeId}`)}
    )
    RETURNING id, decided_at, automation_disclosure
  `,
  )
  const created = rows[0]
  assert(created, 500, 'Failed to record EU statement of reasons')
  await transaction.commit()
  return created
}
