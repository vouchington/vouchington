import { read } from '@data-stores/psql'
import { parsePostgresMoneyAmount } from '@ts-shared/money'
import sql from 'sql-template-strings'
import type { MembershipRefund, MembershipRefundRow } from '../types.mts'

type MembershipRefundRowWithSource = MembershipRefundRow & { membership_source_id: string }

export async function getMembershipRefunds(userId: string): Promise<MembershipRefund[]> {
  const { rows } = await read(sql`/* getMembershipRefunds */
    SELECT * FROM membership_refunds
    WHERE user_id = ${userId}
    ORDER BY id DESC
  `)
  return (rows as MembershipRefundRowWithSource[]).map(mapMembershipRefund)
}

function mapMembershipRefund(row: MembershipRefundRowWithSource): MembershipRefund {
  const {
    amount_minor_units,
    currency_code,
    membership_source_id: _membershipSourceId,
    ...refund
  } = row
  return {
    ...refund,
    amount: {
      amount: parsePostgresMoneyAmount(amount_minor_units),
      currency: currency_code,
    },
  }
}
