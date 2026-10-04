import {
  COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS,
  COPYRIGHT_COUNTER_NOTICE_RISK_KINDS,
  type CopyrightCounterNoticeGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import { isCopyrightSubmissionGuidance } from '@services/copyright-notices/submission-guidance-validation'

export { COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS, COPYRIGHT_COUNTER_NOTICE_RISK_KINDS }
export type { CopyrightCounterNoticeGuidance }

/** No recommendation or decision field is accepted in this advisory result. */
export function parseCopyrightCounterNoticeGuidance(
  value: unknown,
): CopyrightCounterNoticeGuidance {
  if (
    !isCopyrightSubmissionGuidance(
      value,
      'elements',
      'element',
      COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS,
      COPYRIGHT_COUNTER_NOTICE_RISK_KINDS,
    )
  )
    throw new TypeError('Invalid copyright counter-notice guidance')
  return value as CopyrightCounterNoticeGuidance
}
