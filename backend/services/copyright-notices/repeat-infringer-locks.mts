import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'

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
  return rows.map(row => row.account_user_id)
}
