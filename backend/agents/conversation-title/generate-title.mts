import {
  sanitizeAndWrapUserInput,
  callAgentModel,
  SYNCHRONOUS_REQUEST_RETRY_POLICY,
  type AgentModelCaller,
} from '@agents/_shared'
import { generateJson } from '@modules/model-providers/generate'
import type { ModelSelection } from '@modules/model-providers/types'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import type { ConversationMessageContent } from '@services/conversations-messages/types'

const TITLE_GENERATION_PROMPT =
  'Generate a concise title (5-8 words) for the following conversation. Return only the title text with no quotes or extra punctuation.'

const TITLE_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' } },
  required: ['title'],
  additionalProperties: false,
} as const

/** The model-calling seam. Injectable so tests can exercise the agent without a provider. */
export type ConversationTitleModelCaller = AgentModelCaller<{ title: string }>

/* v8 ignore start -- thin provider integration wrapper; exercised by credentialed *.anthropic.test.mts */
export const callConversationTitleModel: ConversationTitleModelCaller = (
  input,
  safetyIdentifier,
  { selection, openaiTransport },
) =>
  generateJson(
    selection,
    {
      instructions: TITLE_GENERATION_PROMPT,
      input,
      schemaName: 'conversation_title',
      schema: TITLE_SCHEMA,
      parse: value => value as { title: string },
      maxOutputTokens: 100,
      safetyIdentifier,
      maxRetries: SYNCHRONOUS_REQUEST_RETRY_POLICY.maxRetries,
    },
    { openaiTransport },
  )
/* v8 ignore stop */

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

export async function generateChatTitleFromInput(
  input: string,
  userId: string,
  selection: ModelSelection,
  callModel: ConversationTitleModelCaller = callConversationTitleModel,
): Promise<string> {
  // Records the ledger row for both outcomes: a successful answer, or a billed one that failed
  // validation (which still billed tokens) before the error propagates.
  const { output } = await callAgentModel({
    agentSlug: 'chat-generate-title',
    selection,
    input,
    safetyIdentifier: userId,
    callModel,
  })

  return (
    output.title
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim() || 'New Conversation'
  )
}
