import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'

/** All account decision, suspension, moderator audit and pause-work rows are owned by this account. */
export async function readOwnedRepeatAtomicState(accountId: string, noticeIds: string[]) {
  const [legal, { rows }] = await Promise.all([
    Promise.all(noticeIds.map(noticeId => readEffectiveReviewState(noticeId, [accountId]))),
    write(sql`/* readOwnedRepeatAtomicState */
      SELECT ARRAY(SELECT to_jsonb(state) FROM copyright_repeat_infringer_account_states state
          WHERE state.account_user_id = ${accountId}) AS account,
        ARRAY(SELECT to_jsonb(identity) FROM copyright_repeat_infringer_review_identities identity
          WHERE identity.account_user_id = ${accountId} ORDER BY identity.id) AS identities,
        ARRAY(SELECT to_jsonb(review) FROM copyright_repeat_infringer_reviews review
          WHERE review.account_user_id = ${accountId} ORDER BY review.copyright_repeat_infringer_review_identity_id) AS reviews,
        ARRAY(SELECT to_jsonb(suspension) FROM user_suspensions suspension
          WHERE suspension.user_id = ${accountId} ORDER BY suspension.id) AS suspensions,
        ARRAY(SELECT to_jsonb(action) FROM moderator_actions action
          WHERE action.target_user_id = ${accountId} ORDER BY action.id) AS actions,
        ARRAY(SELECT to_jsonb(work) FROM membership_pause_collection_work_items work
          WHERE work.user_id = ${accountId}) AS pause_work`),
  ])
  return { legal, account: rows[0] }
}
