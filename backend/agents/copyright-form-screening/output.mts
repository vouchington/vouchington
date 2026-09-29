import { parseLLMJsonResponse } from '@agents/_shared'
import {
  type CopyrightFormGuidance,
  parseCopyrightFormGuidance,
} from '@services/copyright-notices/form-screening-guidance'

const MAX_OUTPUT_LENGTH = 64 * 1024
const MAX_RATIONALE_LENGTH = 10_000
const OUTPUT_KEYS = ['recommendation', 'rationale', 'guidance']

export type CopyrightFormScreeningOutput = {
  recommendation: 'not_obviously_invalid' | 'invalid_or_spam'
  rationale: string
  guidance: CopyrightFormGuidance
}

/** Strictly parses model output; oversized, malformed, or extra-keyed output is rejected. */
export function parseCopyrightFormScreeningOutput(text: string): CopyrightFormScreeningOutput {
  if (text.length > MAX_OUTPUT_LENGTH) throw new TypeError('Invalid copyright form screening JSON')
  let output: unknown
  try {
    output = parseLLMJsonResponse(text)
  } catch {
    throw new TypeError('Invalid copyright form screening JSON')
  }
  const fields = output as { recommendation?: unknown; rationale?: unknown; guidance?: unknown }
  if (
    !output ||
    typeof output !== 'object' ||
    Array.isArray(output) ||
    Object.keys(output).length !== OUTPUT_KEYS.length ||
    !OUTPUT_KEYS.every(key => Object.hasOwn(output, key)) ||
    (fields.recommendation !== 'not_obviously_invalid' &&
      fields.recommendation !== 'invalid_or_spam') ||
    typeof fields.rationale !== 'string' ||
    fields.rationale.length > MAX_RATIONALE_LENGTH
  )
    throw new TypeError('Invalid copyright form screening output')
  let guidance: CopyrightFormGuidance
  try {
    guidance = parseCopyrightFormGuidance(fields.guidance)
  } catch {
    throw new TypeError('Invalid copyright form screening output')
  }
  return { recommendation: fields.recommendation, rationale: fields.rationale, guidance }
}
