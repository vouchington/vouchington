import { createHash } from 'node:crypto'
import type { MembershipRefundReason } from './types.mts'
import type { Money } from '@ts-shared/money'

export type MembershipRefundRequestDetails = {
  targetUserId: string
  chargeId: string | null
  paymentIntentId: string | null
  invoiceId: string
  reason: MembershipRefundReason
  cancel: boolean
  amount?: Money
  note?: string | null
}

export type MembershipRefundRequestIntent = MembershipRefundRequestDetails & {
  idempotencyToken: string
}

export function createStripeRefundIdempotencyKey(
  currentUserId: string,
  idempotencyToken: string,
): string {
  return `voucha-membership-refund-v2:${sha256([currentUserId, idempotencyToken])}`
}

export function createRefundRequestFingerprint(
  membershipId: string,
  options: MembershipRefundRequestDetails,
): string {
  return sha256([
    membershipId,
    options.targetUserId,
    options.chargeId,
    options.paymentIntentId,
    options.invoiceId,
    options.reason,
    options.cancel,
    options.amount?.amount ?? null,
    options.amount?.currency ?? null,
    options.note ?? null,
  ])
}

function sha256(values: Array<string | number | boolean | null>): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex')
}
