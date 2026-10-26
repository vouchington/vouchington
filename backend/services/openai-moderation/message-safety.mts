import type { OpenAI } from '@modules/openai-utils'
import { checkModerationResults, checkPromptInjection } from '@vouchington/utils/ai-moderation'
import createHttpError from 'http-errors'

export type CreateTextModeration = (texts: string[]) => Promise<OpenAI.Moderations.Moderation[]>

// The API-message policy is deliberately broader than the package defaults: `system:` and
// `new instructions` match anywhere in the message, not only at the start of a line.
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|earlier)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|earlier)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(all\s+)?(previous|prior|earlier)\s+(instructions?|prompts?|rules?)/i,
  /system\s*:/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<system>/i,
  /<\/system>/i,
  // Require "now" to avoid benign phrases like "you are a great help"
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instructions?/i,
  /override\s+(previous|prior|all)\s+(instructions?|rules?)/i,
]

export async function checkMessageSafety(
  message: string,
  deps: { createTextModeration: CreateTextModeration },
): Promise<void> {
  if (checkPromptInjection(message, PROMPT_INJECTION_PATTERNS)) {
    throw createHttpError(400, 'Potential prompt injection detected', { code: 'PROMPT_INJECTION' })
  }

  // The SDK's `Categories` is an interface whose values may be null; the package takes
  // `Record<string, boolean>`.
  const results = await deps.createTextModeration([message])
  const violation = checkModerationResults(
    results.map(({ flagged, categories }) => ({
      flagged,
      categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v === true])),
    })),
  )
  if (violation?.code === 'MODERATION_VIOLATION') {
    throw createHttpError(400, 'Content violates moderation policy', {
      code: 'MODERATION_VIOLATION',
      categories: violation.categories,
    })
  }
}
