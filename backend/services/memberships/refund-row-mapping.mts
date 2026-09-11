import { parsePostgresMoneyAmount } from '@ts-shared/money'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipRefund, MembershipRefundRow } from './types.mts'

export type MembershipRefundLedger = MembershipRefund & { membership_source_id: string }
export type MembershipRefundLedgerRow = MembershipRefundRow & { membership_source_id: string }

export function omitMembershipRefundLedgerSource(refund: MembershipRefundLedger): MembershipRefund {
  const { membership_source_id: _membershipSourceId, ...publicRefund } = refund
  return publicRefund
}

export async function getMembershipRefunds(userId: string): Promise<MembershipRefund[]> {
  const { rows } = await read(sql`/* getMembershipRefunds */
    SELECT * FROM membership_refunds
    WHERE user_id = ${userId}
    ORDER BY id DESC
  `)
  return (rows as MembershipRefundLedgerRow[]).map(mapMembershipRefund)
}

export function mapMembershipRefund(row: MembershipRefundLedgerRow): MembershipRefund {
  return omitMembershipRefundLedgerSource(mapMembershipRefundLedger(row))
}

export function mapMembershipRefundLedger(row: MembershipRefundLedgerRow): MembershipRefundLedger {
  const { amount_minor_units, currency_code, ...refund } = row
  return {
    ...refund,
    amount: {
      amount: parsePostgresMoneyAmount(amount_minor_units),
      currency: currency_code,
    },
  }
}
