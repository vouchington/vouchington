import type { CopyrightHoldProceedingKind } from './types.mts'

export function isQualifyingCopyrightLegalHold(input: {
  fromOriginalClaimant: boolean
  sameMaterial: boolean
  proceedingKind: CopyrightHoldProceedingKind | null
  commencedAt: Date | null
  receivedByDesignatedAgentAt: Date | null
  assessedAt: Date
}): boolean {
  return (
    input.fromOriginalClaimant &&
    input.sameMaterial &&
    input.proceedingKind !== null &&
    input.commencedAt !== null &&
    input.receivedByDesignatedAgentAt !== null &&
    input.receivedByDesignatedAgentAt <= input.assessedAt
  )
}
