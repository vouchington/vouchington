import {
  sanitizeAndWrapUserInput,
  createOpenAIResponse,
  DEFAULT_AGENT_MODEL,
  callRecordingAgentResponseUsage,
  SYNCHRONOUS_REQUEST_RETRY_POLICY,
} from '@agents/_shared'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import type { ConversationMessageContent } from '@services/conversations-messages/types'

const TITLE_GENERATION_PROMPT =
  'Generate a concise title (5-8 words) for the following conversation. Return only the title text with no quotes or extra punctuation.'

/**
 * Sanitized conversation text ready for the title-generation prompt, or null when the
 * conversation has no message content yet. Callers can use a null result to skip the OpenAI
 * call -- and any spend-cap check that only exists to gate it -- and fall back to the local
 * "New Conversation" title without spending part of the daily cap on a call this would never make.
 */
export async function getConversationTitleGenerationInput(
  conversationId: string,
): Promise<string | null> {
  const messages = await getConversationMessagesByConversationId(conversationId, { limit: 2 })

  const MAX_CHARS = 1000
  const rawParts = messages.flatMap(msg => {
    const content = msg.content as ConversationMessageContent
    if (!content?.content) return []
    const text =
      content.content.length > MAX_CHARS
        ? `${content.content.slice(0, MAX_CHARS)}...`
        : content.content
    return [{ role: content.role, text }]
  })

  if (rawParts.length === 0) return null

  const sanitizedParts = await Promise.all(
    rawParts.map(async part => {
      const wrapped = await sanitizeAndWrapUserInput(part.text, `chat_${part.role}_message`, {
        includeReminder: false,
      })
      return wrapped
    }),
  )

  return sanitizedParts.join('\n\n')
}

export async function generateChatTitleFromInput(input: string, userId: string): Promise<string> {
  // Records the ledger row for both outcomes: a successful response, or a failed/incomplete one
  // (which still billed tokens) before the error propagates.
  const response = await callRecordingAgentResponseUsage(
    () =>
      createOpenAIResponse(
        {
          model: DEFAULT_AGENT_MODEL,
          instructions: TITLE_GENERATION_PROMPT,
          input,
          safety_identifier: userId,
        },
        { maxRetries: SYNCHRONOUS_REQUEST_RETRY_POLICY.maxRetries },
      ),
    { agentSlug: 'chat-generate-title' },
  )

  return (
    extractTextFromOpenAIResponse(response)
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim() || 'New Conversation'
  )
}

export async function generateChatTitle(conversationId: string, userId: string): Promise<string> {
  const input = await getConversationTitleGenerationInput(conversationId)
  if (input === null) return 'New Conversation'
  return generateChatTitleFromInput(input, userId)
}
