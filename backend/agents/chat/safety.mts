import { createOpenAIModeration } from '@services/openai-moderation/request'
import type { OpenAI } from '@modules/openai-utils'
import createHttpError from 'http-errors'

export type CreateTextModeration = (texts: string[]) => Promise<OpenAI.Moderations.Moderation[]>

// Prompt injection patterns to detect
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
  deps: { createTextModeration?: CreateTextModeration } = {},
): Promise<void> {
  const createTextModeration = deps.createTextModeration ?? createOpenAIModeration
  // Pattern-based detection
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      throw createHttpError(400, 'Potential prompt injection detected', {
        code: 'PROMPT_INJECTION',
      })
    }
  }

  // OpenAI moderation check
  const moderationResults = await createTextModeration([message])

  if (moderationResults.length === 0) {
    return
  }

  const result = moderationResults[0]
  if (!result) {
    return
  }

  if (result.flagged) {
    const flaggedCategories = Object.entries(result.categories).flatMap(([category, flagged]) =>
      flagged ? [category] : [],
    )

    throw createHttpError(400, 'Content violates moderation policy', {
      code: 'MODERATION_VIOLATION',
      categories: flaggedCategories,
    })
  }
}
