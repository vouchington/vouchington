import type { CreateMembershipRefundBody } from '@/lib/api/client/memberships'
import type { RefundableCharge } from '@/types/api-responses'
import type { MembershipRefundFormState } from './membership-refund-form.types.ts'
import { normalizeLocalizedMajorUnitDraft } from '@/lib/money-input-draft'
import { parseMajorUnitsToMoney } from '@ts-shared/money'

export type RefundRequest = Omit<CreateMembershipRefundBody, 'idempotency_key'>

export function createRefundRequest(
  userId: string,
  charge: RefundableCharge,
  form: MembershipRefundFormState,
  locale: string,
): RefundRequest {
  const amount = form.amountStr
    ? parseMajorUnitsToMoney(
        normalizeLocalizedMajorUnitDraft(form.amountStr, locale),
        charge.amount.currency,
      )
    : undefined
  if (amount && amount.amount <= 0) {
    throw new RangeError('Refund amount must be greater than zero')
  }
  return {
    user_id: userId,
    charge_id: charge.charge_id,
    payment_intent_id: charge.payment_intent_id,
    invoice_id: charge.invoice_id,
    reason: form.reason,
    cancel: form.cancel,
    amount,
    note: form.note.trim() || null,
  }
}
