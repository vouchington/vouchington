import { checkPromptInjection, checkModerationResults } from '@vouchington/utils/ai-moderation'
import type { OpenAI } from '@modules/openai-utils'
import createHttpError from 'http-errors'

export type CreateTextModeration = (texts: string[]) => Promise<OpenAI.Moderations.Moderation[]>

export async function checkMessageSafety(
  message: string,
  deps: { createTextModeration: CreateTextModeration },
): Promise<void> {
  if (checkPromptInjection(message)) {
    throw createHttpError(400, 'Potential prompt injection detected', { code: 'PROMPT_INJECTION' })
  }
  const results = await deps.createTextModeration([message])
  const violation = checkModerationResults(
    results.map(result => ({
      flagged: result.flagged,
      categories: Object.fromEntries(
        Object.entries(result.categories).map(([category, flagged]) => [
          category,
          flagged === true,
        ]),
      ),
    })),
  )
  if (violation && violation.code === 'MODERATION_VIOLATION') {
    throw createHttpError(400, 'Content violates moderation policy', violation)
  }
}
