'use client'

import { clientApi } from './instance'
import type {
  MembershipPurchaseIntentResponseBody,
  MembershipVerificationResponseBody,
  MicrosoftStoreServiceTicketsResponseBody,
  MembershipPurchaseProvider,
  BillingPortalSessionResponseBody,
  MembershipPlansResponseBody,
  RefundableChargesResponseBody,
  MembershipRefundResponseBody,
  GrantMembershipResponseBody,
} from '@/types/api-responses'
import type { Money } from '@ts-shared/money'

export function createMembershipPurchaseIntent(
  provider: MembershipPurchaseProvider,
  productId: string,
  idempotencyKey: string,
): Promise<MembershipPurchaseIntentResponseBody> {
  return clientApi.post<MembershipPurchaseIntentResponseBody>(
    '/api/v1/membership-purchase-intents',
    { provider, product_id: productId, idempotency_key: idempotencyKey },
  )
}

export function createMembershipVerification(body: {
  provider: Exclude<MembershipPurchaseProvider, 'stripe'>
  evidence: unknown
  purchase_intent_id?: string
  idempotency_key: string
}): Promise<MembershipVerificationResponseBody> {
  return clientApi.post<MembershipVerificationResponseBody>(
    '/api/v1/membership-verifications',
    body,
  )
}

export function fetchMembershipVerification(
  verificationId: string,
): Promise<MembershipVerificationResponseBody> {
  return clientApi.get<MembershipVerificationResponseBody>(
    `/api/v1/membership-verifications/${encodeURIComponent(verificationId)}`,
  )
}

export function createMicrosoftStoreServiceTickets(): Promise<MicrosoftStoreServiceTicketsResponseBody> {
  return clientApi.post<MicrosoftStoreServiceTicketsResponseBody>(
    '/api/v1/memberships/microsoft-store/service-tickets',
    {},
  )
}

export function createBillingPortalSession(
  returnUrl: string,
): Promise<BillingPortalSessionResponseBody> {
  return clientApi.post<BillingPortalSessionResponseBody>(
    '/api/v1/memberships/billing-portal-sessions',
    {
      return_url: returnUrl,
    },
  )
}

export function grantMembership(
  userId: string,
  plan: string,
  skuId: string,
  durationDays: number,
): Promise<GrantMembershipResponseBody> {
  return clientApi.post<GrantMembershipResponseBody>('/api/v1/membership-grants', {
    user_id: userId,
    plan,
    sku_id: skuId,
    duration_days: durationDays,
  })
}

export function revokeMembershipGrant(grantId: string, reason: string): Promise<void> {
  return clientApi.delete(`/api/v1/membership-grants/${encodeURIComponent(grantId)}`, {
    body: { reason },
  })
}

export function fetchPlans(): Promise<MembershipPlansResponseBody> {
  /* c8 ignore next -- trivial client API pass-through, covered by integration tests */
  return clientApi.get<MembershipPlansResponseBody>('/api/v1/memberships/plans')
}

export function fetchRefundableCharges(userId: string): Promise<RefundableChargesResponseBody> {
  /* c8 ignore next -- trivial client API pass-through, covered by integration tests */
  return clientApi.get<RefundableChargesResponseBody>(
    `/api/v1/memberships/refundable-charges?user_id=${encodeURIComponent(userId)}`,
  )
}

export type CreateMembershipRefundBody = {
  user_id: string
  charge_id?: string | null
  payment_intent_id?: string | null
  invoice_id: string
  reason: string
  cancel: boolean
  amount?: Money
  note?: string | null
  idempotency_key: string
}

export function createMembershipRefund(
  body: CreateMembershipRefundBody,
): Promise<MembershipRefundResponseBody> {
  /* c8 ignore next -- trivial client API pass-through, covered by integration tests */
  return clientApi.post<MembershipRefundResponseBody>('/api/v1/memberships/refunds', body)
}
