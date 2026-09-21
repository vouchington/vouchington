import { isEmailAddress } from '@ts-shared/utils/validation-core'
import assert from 'http-assert'
import type { CopyrightJurisdiction } from './types.mts'

export type StructuredCopyrightNoticeForm = {
  jurisdiction: CopyrightJurisdiction
  claimantContact: string
  claimantEmail: string
  workDescription: string
  goodFaithBelief: boolean
  accuracyAuthorityUnderPenaltyOfPerjury: boolean
  electronicSignature: string
  claimantTargets: Array<{ hostedUseUrl: string }>
}

/**
 * The automatic path may use only declarations captured and validated by the structured form.
 * This is deliberately independent from the agent's anti-spam recommendation.
 */
export function assertStructuredNoticeStatutoryFields(
  request: StructuredCopyrightNoticeForm,
): void {
  assert(request.jurisdiction === 'us_dmca', 422, 'jurisdiction is required')
  assert(
    isBoundedNonEmptyString(request.claimantContact, 4096),
    422,
    'claimant contact is required',
  )
  assert(
    request.claimantEmail.length <= 254 && isEmailAddress(request.claimantEmail),
    422,
    'claimant contact must be a valid email address',
  )
  assert(
    isBoundedNonEmptyString(request.workDescription, 50_000),
    422,
    'work description is required',
  )
  assert(request.goodFaithBelief, 422, 'good-faith belief is required')
  assert(
    request.accuracyAuthorityUnderPenaltyOfPerjury,
    422,
    'accuracy and authority declaration is required',
  )
  assert(
    isBoundedNonEmptyString(request.electronicSignature, 500),
    422,
    'electronic signature is required',
  )
  assert(
    request.claimantTargets.length > 0 && request.claimantTargets.length <= 20,
    422,
    'at least one hosted target is required',
  )
  assert(
    request.claimantTargets.every(target => isBoundedNonEmptyString(target.hostedUseUrl, 2048)),
    422,
    'each hosted target URL is required',
  )
}

function isBoundedNonEmptyString(value: string, maximumLength: number): boolean {
  return value.trim().length > 0 && value.length <= maximumLength
}
