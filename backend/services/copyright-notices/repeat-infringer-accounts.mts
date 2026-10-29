import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

type CopyrightRepeatInfringerNoticeAccount = {
  account_user_id: string
  incident_id: string
  is_operative: boolean
  open_review_id: string | null
  termination_in_effect: boolean
}

export async function listCopyrightRepeatInfringerAccountsForNotice(
  currentUser: PrivateUser,
  noticeId: string,
): Promise<CopyrightRepeatInfringerNoticeAccount[]> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  const notice = await read<{ id: string }>(sql`/* requireCopyrightRepeatInfringerNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId}::uuid
  `)
  assert(notice.rows[0], 404, 'Copyright notice not found')
  const { rows } = await read<CopyrightRepeatInfringerNoticeAccount>(sql`
    /* listCopyrightRepeatInfringerAccountsForNotice */
    SELECT incident.account_user_id,
      incident.id AS incident_id,
      incident.is_operative,
      open_review.id AS open_review_id,
      COALESCE(account_state.termination_in_effect, false) AS termination_in_effect
    FROM copyright_repeat_infringer_incidents incident
    LEFT JOIN copyright_repeat_infringer_account_states account_state
      ON account_state.account_user_id = incident.account_user_id
    LEFT JOIN copyright_repeat_infringer_review_identities open_review
      ON open_review.id = account_state.current_open_review_identity_id
    WHERE incident.copyright_notice_id = ${noticeId}
    ORDER BY incident.account_user_id
  `)
  return rows
}
