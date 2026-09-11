import type { RefundableCharge } from '@/types/api-responses'

// invoice_id is always present, so a charge always resolves to a stable non-empty key.
export function chargeKey(charge: RefundableCharge): string {
  return charge.charge_id ?? charge.payment_intent_id ?? charge.invoice_id
}
