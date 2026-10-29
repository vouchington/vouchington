import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import {
  insertCopyrightEmailIntakeNoticeLink,
  type CopyrightEmailIntakeNoticeLink,
} from '../services/copyright-notices/email-thread-link.mts'

/** Link an intake to a notice, in the caller's transaction or in one it commits itself. */
export async function linkCopyrightEmailIntakeToNotice(
  input: CopyrightEmailIntakeNoticeLink,
  transaction?: TransactionQuery,
): Promise<boolean> {
  if (transaction) return insertCopyrightEmailIntakeNoticeLink(transaction, input)
  await using owned = await beginTransaction()
  const linked = await insertCopyrightEmailIntakeNoticeLink(owned, input)
  await owned.commit()
  return linked
}
