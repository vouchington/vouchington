import assert from 'http-assert'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import type { PrivateUser } from '@services/users/types'
import type { CopyrightJurisdiction, CopyrightNoticeTargetInput } from './types.mts'

export type PromoteCopyrightEmailIntakeInput = {
  currentUser: PrivateUser
  intakeId: string
  recommendationId: string | null
  manualFallbackReason: string | null
  jurisdiction: CopyrightJurisdiction
  claimantDisplayName: string | null
  claimantContact: string
  claimantEmail: string
  workDescription: string
  goodFaithBelief: boolean
  accuracyAuthorityUnderPenaltyOfPerjury: boolean
  electronicSignature: string
  targets: CopyrightNoticeTargetInput[]
  rationale: string
}

export function assertStatutoryEmailFields(input: PromoteCopyrightEmailIntakeInput): void {
  assert(
    input.claimantEmail.length <= 254 && isEmailAddress(input.claimantEmail),
    422,
    'claimant email must be a valid email address',
  )
  assert(input.claimantContact.trim(), 422, 'claimant contact is required')
  assert(input.workDescription.trim(), 422, 'work description is required')
  assert(input.goodFaithBelief, 422, 'good-faith belief is required')
  assert(
    input.accuracyAuthorityUnderPenaltyOfPerjury,
    422,
    'accuracy and authority declaration is required',
  )
  assert(input.electronicSignature.trim(), 422, 'electronic signature is required')
  assert(input.rationale.trim(), 422, 'Email intake review rationale is required')
  assert(
    input.recommendationId || input.manualFallbackReason?.trim(),
    422,
    'Agent recommendation or manual fallback reason is required',
  )
  assert(
    !input.manualFallbackReason || input.manualFallbackReason.length <= 10_000,
    422,
    'Manual fallback reason is too long',
  )
  assert(input.targets.length > 0, 422, 'At least one target is required')
}
