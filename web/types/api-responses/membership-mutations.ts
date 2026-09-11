import type { MembershipPurchaseProvider, MembershipVerificationReasonCode } from './memberships'

export type GrantMembershipResponseBody =
  | { membership: null; grant: { id: string }; queued: true }
  | { membership: { id: string }; grant: { id: string }; queued: false }

export interface MembershipPurchaseIntentResponseBody {
  purchase_intent: {
    id: string
    provider: MembershipPurchaseProvider
    product_id: string
    launch:
      | { kind: 'stripe_checkout'; checkout_url: string }
      | { kind: 'apple_app_store'; product_id: string; app_account_token: string }
      | {
          kind: 'google_play'
          product_id: string
          base_plan_id: string | null
          offer_id: string | null
          obfuscated_account_id: string
        }
      | { kind: 'microsoft_store'; product_id: string; sku_id: string | null }
    replayed: boolean
  }
}

export interface MembershipVerificationResponseBody {
  verification: {
    id: string
    provider: MembershipPurchaseProvider
    status: 'pending' | 'verified' | 'conflict' | 'rejected'
    reason_code: MembershipVerificationReasonCode | null
    created_at: string
  }
}

export interface BillingPortalSessionResponseBody {
  portal_session: { url: string }
}
