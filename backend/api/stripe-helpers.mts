import { randomUUID } from 'node:crypto'
import {
  createBillingPortalSessionOperation,
  createIdentityCheckoutSessionOperation,
  retrieveIdentityVerificationSessionUrlOperation,
  type CreateBillingPortalSessionPayload,
  type CreateIdentityCheckoutSessionPayload,
} from '@modules/stripe/operations'

type IdentityCheckoutInput = Omit<
  CreateIdentityCheckoutSessionPayload,
  'customerIdempotencyKey' | 'checkoutIdempotencyKey'
>
type BillingPortalInput = Omit<CreateBillingPortalSessionPayload, 'idempotencyKey'>

export function createIdentityCheckoutSession(input: IdentityCheckoutInput) {
  return createIdentityCheckoutSessionOperation({
    ...input,
    customerIdempotencyKey: randomUUID(),
    checkoutIdempotencyKey: randomUUID(),
  })
}

export function createBillingPortalSession(input: BillingPortalInput) {
  return createBillingPortalSessionOperation({ ...input, idempotencyKey: randomUUID() })
}

export function retrieveIdentityVerificationSessionUrl(sessionId: string) {
  return retrieveIdentityVerificationSessionUrlOperation({ sessionId })
}
