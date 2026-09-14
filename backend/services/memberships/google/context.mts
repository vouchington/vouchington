import type { MembershipVerificationReasonCode } from '../verification-contract.mts'

export type GooglePlayVerificationContext = {
  verificationId: string
  userId: string
  purchaseIntentId: string | null
  evidenceId: string
  encryptedEvidence: Buffer
  evidenceLookupSha256: string
  evidenceRejectedAt: Date | null
  evidenceRejectionReason: MembershipVerificationReasonCode | null
  evidenceVerifiedAt: Date | null
  evidenceLineageId: string | null
  environment: 'test' | 'production'
  applicationId: string
}
