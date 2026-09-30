import type { ApiFixtureCase } from './types.mts'
import { encodeCursor } from '@modules/pagination'

const conversationId = '0198ffff-0000-7000-8000-000000000001'
const userMessageId = '0198ffff-0001-7000-8000-000000000001'
const assistantMessageId = '0198ffff-0001-7000-8000-000000000002'
const timestamp = '2026-09-29T00:00:00.000Z'
const message = (id: string, role: 'user' | 'assistant', content: string | null) => ({
  id,
  conversation_id: conversationId,
  content: { role, content },
  created_at: timestamp,
  updated_at: timestamp,
  completion: { status: content === null ? 'incomplete' : 'completed' },
})
const userMessage = message(userMessageId, 'user', 'Hello')
const assistantMessage = message(assistantMessageId, 'assistant', 'Hi')
const turnBody = {
  user_message: userMessage,
  assistant_message: assistantMessage,
  turn: { user_message_id: userMessageId, assistant_message_id: assistantMessageId },
}
const requestBody = {
  user_message_id: userMessageId,
  assistant_message_id: assistantMessageId,
  message: 'Hello',
  assistant_content: 'Hi',
  model_provider: 'apple_foundation',
}
const base = {
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom: ['docs/requirements/api/v1/conversations/README.md'],
} satisfies Pick<ApiFixtureCase, 'consumers' | 'migratedFrom'>
const postCase = (id: string, status: number, body: unknown): ApiFixtureCase => ({
  ...base,
  id: `native.chat.${id}`,
  method: 'POST',
  path: `/api/v1/conversations/${conversationId}/client-generated-chat`,
  route: {
    routeTemplate: '/api/v1/conversations/:conversationId/client-generated-chat',
    pathParams: { conversationId },
  },
  backendResponseContractKey:
    status === 200
      ? undefined
      : `POST:/api/v1/conversations/:conversationId/client-generated-chat#${status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'conflict'}`,
  requestBody,
  auth: status === 401 ? 'none' : 'fixture-user',
  status,
  body,
})
const historyCase = (id: string, results: unknown[], hasMore: boolean): ApiFixtureCase => ({
  ...base,
  id: `native.chat.${id}`,
  method: 'GET',
  path: `/api/v1/my/conversations/${conversationId}/messages`,
  route: {
    routeTemplate: '/api/v1/my/conversations/:conversationId/messages',
    pathParams: { conversationId },
  },
  query: {
    limit: '1',
    ...(id === 'page-2' ? { after: encodeCursor({ id: assistantMessageId }) } : {}),
  },
  auth: 'fixture-user',
  status: 200,
  body: {
    results,
    page_info: {
      has_next_page: hasMore,
      start_cursor: encodeCursor({ id: id === 'page-2' ? userMessageId : assistantMessageId }),
      end_cursor: hasMore ? encodeCursor({ id: assistantMessageId }) : null,
    },
  },
})
export const nativeChatApiFixtureCases: ApiFixtureCase[] = [
  postCase('completed', 200, turnBody),
  postCase('duplicate', 200, turnBody),
  postCase('retry', 200, turnBody),
  postCase('unauthorized', 401, { message: 'Unauthorized' }),
  postCase('forbidden', 403, { message: 'Access denied' }),
  postCase('identity-conflict', 409, {
    message: 'Message identity is already used by a different turn',
  }),
  historyCase('page-1', [assistantMessage], true),
  historyCase('page-2', [userMessage], false),
  historyCase('incomplete', [message(assistantMessageId, 'assistant', null)], false),
  {
    ...base,
    id: 'native.chat.conversations',
    method: 'GET',
    path: '/api/v1/my/conversations',
    route: { routeTemplate: '/api/v1/my/conversations' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        { id: conversationId, title: 'Chat', created_at: timestamp, updated_at: timestamp },
      ],
      page_info: {
        has_next_page: false,
        start_cursor: encodeCursor({ id: conversationId }),
        end_cursor: null,
      },
    },
  },
]
