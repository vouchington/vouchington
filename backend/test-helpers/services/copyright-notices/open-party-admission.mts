import { beginTransaction } from '@data-stores/psql'
import { retainCopyrightCaseAccountParty } from '../../../services/copyright-notices/retention-parties-admission.mts'

/** Runs `during` while an admission of the account as a notice party is inserted but uncommitted. */
export async function duringOpenCopyrightPartyAdmission<Result>(
  noticeId: string,
  accountUserId: string,
  during: () => Promise<Result>,
): Promise<Result> {
  await using admission = await beginTransaction()
  await retainCopyrightCaseAccountParty(admission, noticeId, accountUserId)
  const result = await during()
  await admission.commit()
  return result
}
