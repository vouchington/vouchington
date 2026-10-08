import { parseCopyrightCounterNoticeGuidance } from '@services/copyright-notices/counter-notice-guidance'
import { parseCopyrightLegalHoldGuidance } from '@services/copyright-notices/legal-hold-guidance'
import type {
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
export type CopyrightSubmissionGuidanceKind = 'counter_notice' | 'court_or_ccb_hold'

/** Rejects malformed, extra-keyed, or decision-shaped advisory output. */
export function parseCopyrightSubmissionGuidanceOutput(
  output: unknown,
  kind: CopyrightSubmissionGuidanceKind,
): CopyrightCounterNoticeGuidance | CopyrightLegalHoldGuidance {
  try {
    return kind === 'counter_notice'
      ? parseCopyrightCounterNoticeGuidance(output)
      : parseCopyrightLegalHoldGuidance(output)
  } catch {
    throw new TypeError('Invalid copyright submission guidance output')
  }
}
