import { parsePostgresMoneyAmount } from '@vouchington/utils/money'
import createHttpError from 'http-errors'
import type { AdministratorRefundRequest } from './types.mts'

export type AdministratorRefundOperation = { completed: boolean; id: string }
export type AdministratorRefundRequestRow = AdministratorRefundOperation & {
  amountMinorUnits: string
  cancelRequested: boolean
  currency: string
  issuedById: string
  membershipId: string
  note: string | null
  providerPaymentReference: string
  providerSubscriptionReference: string | null
  reason: string
  requestFingerprint: string
}

export function assertAdministratorRefundRequestMatches(
  saved: AdministratorRefundRequestRow,
  request: AdministratorRefundRequest,
): void {
  if (!administratorRefundRequestMatches(saved, request))
    throw createHttpError(
      409,
      'Administrator refund idempotency key was reused for a different request',
    )
}

function administratorRefundRequestMatches(
  saved: AdministratorRefundRequestRow,
  request: AdministratorRefundRequest,
): boolean {
  return (
    saved.membershipId === request.membershipId &&
    saved.issuedById === request.issuedById &&
    saved.providerPaymentReference === request.providerPaymentReference &&
    saved.providerSubscriptionReference === request.providerSubscriptionReference &&
    parsePostgresMoneyAmount(saved.amountMinorUnits) === request.amount.amount &&
    saved.currency === request.amount.currency &&
    saved.reason === request.reason &&
    saved.cancelRequested === request.cancelRequested &&
    saved.requestFingerprint === request.requestFingerprint &&
    saved.note === request.note
  )
}
