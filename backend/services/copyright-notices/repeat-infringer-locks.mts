import type { OwnedTransaction } from '@data-stores/psql'
import { lockCopyrightNoticeLifetime } from './notice-lifetime.mts'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'

async function lockCopyrightRepeatInfringerNoticeAccounts(
  noticeId: string,
  transaction: OwnedTransaction,
): Promise<string[]> {
  const accountIds = await readNoticeAccounts(noticeId, transaction)
  for (const accountId of accountIds) {
    // oxlint-disable-next-line no-await-in-loop -- all notice owners acquire the canonical author locks in UUID order.
    await lockAuthorPublicationLifecycle(transaction, accountId)
  }
  return accountIds
}

/** Acquire before placement or mutable legal rows; reuse only within this notice transaction. */
export class CopyrightNoticeAccountLocks {
  private readonly noticeId: string
  private readonly transaction: OwnedTransaction
  private readonly accountIds: readonly string[]
  private constructor(
    noticeId: string,
    transaction: OwnedTransaction,
    accountIds: readonly string[],
  ) {
    this.noticeId = noticeId
    this.transaction = transaction
    this.accountIds = Object.freeze([...accountIds])
  }
  static async acquire(noticeId: string, transaction: OwnedTransaction) {
    await lockCopyrightNoticeLifetime(transaction, noticeId)
    return new CopyrightNoticeAccountLocks(
      noticeId,
      transaction,
      await lockCopyrightRepeatInfringerNoticeAccounts(noticeId, transaction),
    )
  }
  async recheck(noticeId: string, transaction: OwnedTransaction): Promise<string[]> {
    assert(
      noticeId === this.noticeId && transaction === this.transaction,
      409,
      'Copyright account locks are outside their owner transaction',
    )
    const current = await readNoticeAccounts(noticeId, transaction, true)
    assert(
      current.length === this.accountIds.length &&
        current.every((id, index) => id === this.accountIds[index]),
      409,
      'Copyright notice account ownership changed',
    )
    return current
  }
}

async function readNoticeAccounts(
  noticeId: string,
  transaction: OwnedTransaction,
  recheck = false,
) {
  const statement = recheck
    ? sql`/* recheckCopyrightRepeatInfringerNoticeAccounts */`
    : sql`/* lockCopyrightRepeatInfringerNoticeAccounts */`
  statement.append(sql`
    SELECT party.user_id AS account_user_id
    FROM copyright_notice_targets target
    CROSS JOIN LATERAL `)
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
