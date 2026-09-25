import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export type CopyrightRepeatInfringerNoticeAccount = {
  account_user_id: string
  incident_id: string
  operative: boolean
  open_review_id: string | null
  termination_in_effect: boolean
}

export async function listCopyrightRepeatInfringerAccountsForNotice(
  currentUser: PrivateUser,
  noticeId: string,
): Promise<CopyrightRepeatInfringerNoticeAccount[]> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  const { rows } = await read<CopyrightRepeatInfringerNoticeAccount>(sql`
    /* listCopyrightRepeatInfringerAccountsForNotice */
    SELECT incident.account_user_id,
      incident.id AS incident_id,
      incident.operative,
      open_review.id AS open_review_id,
      EXISTS (
        SELECT 1 FROM copyright_repeat_infringer_reviews terminated
        WHERE terminated.account_user_id = incident.account_user_id
          AND terminated.outcome = 'terminate'
          AND NOT EXISTS (
            SELECT 1 FROM copyright_repeat_infringer_reviews reinstated
            WHERE reinstated.account_user_id = terminated.account_user_id
              AND reinstated.outcome = 'reinstatement'
              AND reinstated.outcome_at > terminated.outcome_at
          )
      ) AS termination_in_effect
    FROM copyright_repeat_infringer_incidents incident
    LEFT JOIN copyright_repeat_infringer_reviews open_review
      ON open_review.account_user_id = incident.account_user_id
      AND open_review.outcome IS NULL
    WHERE incident.copyright_notice_id = ${noticeId}
    ORDER BY incident.account_user_id
  `)
  return rows
}
