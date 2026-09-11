import { checkMessageSafety, type CreateTextModeration } from '@agents/chat/safety'
import { createOpenAIModeration } from '@services/openai-moderation/request'

const createApiTextModeration: CreateTextModeration = async texts => {
  return createOpenAIModeration(texts, undefined, {
    apiSafetyCheck: true,
    idempotencyKey: crypto.randomUUID(),
  })
}

/** API-only safety guard: policy and provider transport remain local. */
export async function checkApiMessageSafety(message: string): Promise<void> {
  await checkMessageSafety(message, { createTextModeration: createApiTextModeration })
}
