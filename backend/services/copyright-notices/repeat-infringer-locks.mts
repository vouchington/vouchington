import type { OwnedTransaction } from '@data-stores/psql'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'

export async function lockCopyrightRepeatInfringerNoticeAccounts(
  noticeId: string,
  transaction: OwnedTransaction,
): Promise<string[]> {
  const statement = sql`
    /* lockCopyrightRepeatInfringerNoticeAccounts */
    SELECT party.user_id AS account_user_id
    FROM copyright_notice_targets target
    CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql('strike'))
  statement.append(sql` party
    WHERE target.copyright_notice_id = ${noticeId}
    UNION
    SELECT account_user_id FROM copyright_repeat_infringer_incidents
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY account_user_id
  `)
  const { rows } = await transaction<{ account_user_id: string }>(statement)
  const accountIds = rows.map(row => row.account_user_id)
  for (const accountId of accountIds) {
    // oxlint-disable-next-line no-await-in-loop -- all notice owners acquire the canonical author locks in UUID order.
    await lockAuthorPublicationLifecycle(transaction, accountId)
  }
  return accountIds
}
