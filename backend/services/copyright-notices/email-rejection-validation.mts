import type { PrivateUser } from '@services/users/types'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import assert from 'http-assert'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export type CopyrightEmailRejectionInput = {
  currentUser: PrivateUser
  intakeId: string
  recommendationId: string | null
  manualFallbackReason: string | null
  rationale: string
  replyEmail?: string | null
  responseKind?: 'rejected' | 'needs_information'
  responseMessage?: string | null
}

/** Validate the selected reply and final review before preparing any encryption key. */
export function validateCopyrightEmailRejection(
  input: CopyrightEmailRejectionInput,
): string | null {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim(), 422, 'Email intake review rationale is required')
  assert(
    input.responseKind !== 'needs_information' || Boolean(input.responseMessage?.trim()),
    422,
    'Needs-information responses require a response message',
  )
  assert(
    !input.responseMessage || input.responseMessage.length <= 10_000,
    422,
    'Invalid response message',
  )
  const replyEmail = input.replyEmail ?? null
  assert(
    replyEmail === null || (replyEmail.length <= 254 && isEmailAddress(replyEmail)),
    422,
    'reply email must be a valid email address',
  )
  assert(
    (input.recommendationId === null) !== (input.manualFallbackReason === null),
    422,
    'Provide either recommendation_id or manual_fallback_reason',
  )
  if (input.manualFallbackReason !== null)
    assert(
      input.manualFallbackReason.trim() && input.manualFallbackReason.length <= 10_000,
      422,
      'Invalid manual fallback reason',
    )
  return replyEmail
}
