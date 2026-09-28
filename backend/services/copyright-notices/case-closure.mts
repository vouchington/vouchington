import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export async function closeCopyrightNoticeCase(input: {
  currentUser: PrivateUser
  noticeId: string
  closedAt: Date
}): Promise<{ id: string }> {
  assert(
    currentUserCanReviewCopyrightNotices(input.currentUser),
    403,
    'Only copyright staff can close a copyright case',
  )
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`/* closeCopyrightNoticeCase */
    INSERT INTO copyright_notice_closures (copyright_notice_id, closed_at, closed_by_user_id)
    SELECT notice.id, ${input.closedAt}, ${input.currentUser.id}
    FROM copyright_notices notice
    WHERE notice.id = ${input.noticeId}
    ON CONFLICT (copyright_notice_id) DO NOTHING
    RETURNING id
  `)
  const closure = rows[0]
  assert(closure, 409, 'Copyright case is already closed or was not found')
  await transaction.commit()
  return closure
}
