import { createHash } from 'node:crypto'
import type { MembershipPurchaseProvider } from './purchase-intent-launches.mts'

export type VerificationLifecycle = {
  verified_at: Date | null
  conflicted_at: Date | null
  rejected_at: Date | null
}

export type MembershipVerificationStatus = 'pending' | 'verified' | 'conflict' | 'rejected'

export type MembershipVerificationReasonCode =
  | 'verified'
  | 'competing_direct_source'
  | 'invalid_evidence'
  | 'wrong_account'
  | 'wrong_application'
  | 'wrong_environment'
  | 'wrong_product'
  | 'revoked'
  | 'expired'
  | 'purchase_pending'
  | 'missing_account_token'
  | 'stale_evidence'

export type MembershipVerification = {
  id: string
  provider: MembershipPurchaseProvider
  status: MembershipVerificationStatus
  reason_code: MembershipVerificationReasonCode | null
  created_at: Date
}

export function createMembershipVerificationFingerprint(
  provider: MembershipPurchaseProvider,
  purchaseIntentId: string | null,
  evidence: unknown,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonicalizeMembershipEvidence({
          evidence,
          provider,
          purchase_intent_id: purchaseIntentId,
        }),
      ),
    )
    .digest('hex')
}

export function getMembershipVerificationStatus(
  row: VerificationLifecycle,
): MembershipVerificationStatus {
  if (row.verified_at) return 'verified'
  if (row.conflicted_at) return 'conflict'
  if (row.rejected_at) return 'rejected'
  return 'pending'
}

export function canonicalizeMembershipEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeMembershipEvidence)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalizeMembershipEvidence(child)]),
    )
  return value
}
