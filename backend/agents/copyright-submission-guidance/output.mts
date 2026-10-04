import { parseLLMJsonResponse } from '@agents/_shared'
import { parseCopyrightCounterNoticeGuidance } from '@services/copyright-notices/counter-notice-guidance'
import { parseCopyrightLegalHoldGuidance } from '@services/copyright-notices/legal-hold-guidance'
import type {
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import type { CopyrightSubmissionGuidanceKind } from './model.mts'

const MAX_OUTPUT_LENGTH = 64 * 1024

/** Rejects malformed, oversized, extra-keyed, or decision-shaped advisory output. */
export function parseCopyrightSubmissionGuidanceOutput(
  text: string,
  kind: CopyrightSubmissionGuidanceKind,
): CopyrightCounterNoticeGuidance | CopyrightLegalHoldGuidance {
  if (text.length > MAX_OUTPUT_LENGTH)
    throw new TypeError('Invalid copyright submission guidance JSON')
  let output: unknown
  try {
    output = parseLLMJsonResponse(text)
  } catch {
    throw new TypeError('Invalid copyright submission guidance JSON')
  }
  try {
    return kind === 'counter_notice'
      ? parseCopyrightCounterNoticeGuidance(output)
      : parseCopyrightLegalHoldGuidance(output)
  } catch {
    throw new TypeError('Invalid copyright submission guidance output')
  }
}
