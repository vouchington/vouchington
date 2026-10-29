import type { OwnedTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { CopyrightNoticeAccountLocks } from './repeat-infringer-locks.mts'

/** Account publication locks precede every mutable appeal, restriction, incident and notice row. */
export async function lockCopyrightAppealReviewOwners(
  submissionId: string,
  transaction: OwnedTransaction,
) {
  const { rows } = await transaction<{ copyright_notice_id: string }>(sql`
    /* lockCopyrightAppealReviewOwners */
    SELECT copyright_notice_id FROM copyright_notice_submissions
    WHERE id = ${submissionId} AND kind = 'appeal'
  `)
  const noticeId = rows[0]?.copyright_notice_id
  assert(noticeId, 404, 'Copyright appeal not found')
  const accountLocks = await CopyrightNoticeAccountLocks.acquire(noticeId, transaction)
  return { noticeId, accountLocks }
}
