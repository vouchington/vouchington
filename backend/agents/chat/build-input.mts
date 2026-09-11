import { sanitizeAndWrapUserInput } from '@agents/_shared'
import { getConversationMessagesByConversationIdForMutation } from '@services/conversations-messages/messages'

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ChatHistoryScope = 'full-history' | 'current-turn'

export class InvalidStoredChatHistoryError extends TypeError {
  constructor() {
    super('Stored chat history contains an invalid message')
  }
}

const USER_MESSAGE_KEYS = ['role', 'content'] as const
const ASSISTANT_MESSAGE_KEYS = ['role', 'content', 'error'] as const

export async function buildChatInput(
  conversationId: string,
  userMessage: string,
  scope: ChatHistoryScope,
): Promise<ChatHistoryMessage[]> {
  if (scope === 'current-turn') {
    return [await sanitizeChatMessage({ role: 'user', content: userMessage })]
  }

  const conversationMessages = await getConversationMessagesByConversationIdForMutation(
    conversationId,
    {
      limit: 20,
    },
  )
  const storedHistory = conversationMessages.flatMap(message =>
    parseStoredChatMessage(message.content),
  )
  const latestMessage = storedHistory.at(-1)
  const history =
    latestMessage?.role === 'user' && latestMessage.content === userMessage
      ? storedHistory
      : [...storedHistory, { role: 'user', content: userMessage } satisfies ChatHistoryMessage]

  return Promise.all(history.map(sanitizeChatMessage))
}

function parseStoredChatMessage(value: unknown): ChatHistoryMessage[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidStoredHistoryError()
  }

  const message = value as Record<string, unknown>
  if (
    message.role === 'user' &&
    hasOnlyAllowedKeys(message, USER_MESSAGE_KEYS) &&
    typeof message.content === 'string'
  ) {
    return [{ role: 'user', content: message.content }]
  }
  if (message.role === 'assistant' && hasOnlyAllowedKeys(message, ASSISTANT_MESSAGE_KEYS)) {
    if (Object.hasOwn(message, 'error') && typeof message.error !== 'string') {
      throw invalidStoredHistoryError()
    }
    if (message.content === null) return []
    if (typeof message.content === 'string') {
      return [{ role: 'assistant', content: message.content }]
    }
  }
  throw invalidStoredHistoryError()
}

function hasOnlyAllowedKeys(
  message: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(message).every(key => allowedKeys.includes(key))
}

async function sanitizeChatMessage(message: ChatHistoryMessage): Promise<ChatHistoryMessage> {
  return {
    role: message.role,
    content: await sanitizeAndWrapUserInput(message.content, `chat_${message.role}_message`, {
      includeReminder: false,
    }),
  }
}

function invalidStoredHistoryError(): InvalidStoredChatHistoryError {
  return new InvalidStoredChatHistoryError()
}
