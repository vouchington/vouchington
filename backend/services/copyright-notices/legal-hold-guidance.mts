import {
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
  COPYRIGHT_LEGAL_HOLD_RISK_KINDS,
  type CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import { isCopyrightSubmissionGuidance } from '@services/copyright-notices/submission-guidance-validation'

export { COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA, COPYRIGHT_LEGAL_HOLD_RISK_KINDS }
export type { CopyrightLegalHoldGuidance }

/** No recommendation or decision field is accepted in this advisory result. */
export function parseCopyrightLegalHoldGuidance(value: unknown): CopyrightLegalHoldGuidance {
  if (
    !isCopyrightSubmissionGuidance(
      value,
      'criteria',
      'criterion',
      COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
      COPYRIGHT_LEGAL_HOLD_RISK_KINDS,
    )
  )
    throw new TypeError('Invalid copyright legal-hold guidance')
  return value as CopyrightLegalHoldGuidance
}
