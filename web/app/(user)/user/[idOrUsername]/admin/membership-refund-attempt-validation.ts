import type { RefundRequest } from './membership-refund-request.ts'
import type { RefundableCharge } from '@/types/api-responses'
import { isMoney } from '@ts-shared/money'

const REFUND_REASONS = new Set(['goodwill', 'requested', 'dispute', 'other'])

export function isRefundRequest(value: unknown, userId: string): value is RefundRequest {
  if (!isObject(value) || value.user_id !== userId) return false
  if (!isNullableString(value.charge_id) || !isNullableString(value.payment_intent_id)) return false
  if (!value.charge_id && !value.payment_intent_id) return false
  if (typeof value.invoice_id !== 'string' || !value.invoice_id) return false
  if (typeof value.reason !== 'string' || !REFUND_REASONS.has(value.reason)) return false
  if (typeof value.cancel !== 'boolean') return false
  if (
    value.amount !== undefined &&
    (!isMoney(value.amount) || (value.amount as { amount: number }).amount <= 0)
  ) {
    return false
  }
  return value.note === null || value.note === undefined || typeof value.note === 'string'
}

export function matchesRefundRequest(charge: RefundableCharge, request: RefundRequest): boolean {
  return (
    charge.charge_id === request.charge_id &&
    charge.payment_intent_id === request.payment_intent_id &&
    charge.invoice_id === request.invoice_id
  )
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}
