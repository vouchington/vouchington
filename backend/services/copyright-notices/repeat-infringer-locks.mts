import type { OwnedTransaction } from '@data-stores/psql'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import sql from 'sql-template-strings'

export async function lockCopyrightRepeatInfringerNoticeAccounts(
  noticeId: string,
  transaction: OwnedTransaction,
): Promise<string[]> {
  const { rows } = await transaction<{ account_user_id: string }>(sql`
    /* lockCopyrightRepeatInfringerNoticeAccounts */
    SELECT post.created_by_id AS account_user_id
    FROM copyright_notice_targets target
    JOIN media_placements placement
      ON target.placement_id = placement.id
    JOIN image_placements image_placement ON image_placement.placement_id = placement.id
    JOIN posts post ON post.id = image_placement.post_id
    WHERE target.copyright_notice_id = ${noticeId} AND post.created_by_id IS NOT NULL
    UNION
    SELECT account_user_id FROM copyright_repeat_infringer_incidents
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY account_user_id
  `)
  const accountIds = rows.map(row => row.account_user_id)
  for (const accountId of accountIds) {
    // oxlint-disable-next-line no-await-in-loop -- all notice owners acquire the canonical author locks in UUID order.
    await lockAuthorPublicationLifecycle(transaction, accountId)
  }
  return accountIds
}
