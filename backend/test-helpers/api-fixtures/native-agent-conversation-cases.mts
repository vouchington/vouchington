import type { ApiFixtureCase } from './types.mts'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { agentMessageCursorScope } from '@modules/agents'
import {
  nativeAgentFixtureAgentId,
  nativeAgentListApiFixtureCases,
} from './native-agent-list-cases.mts'

const conversationId = '00000000-0000-7000-8000-000000000101'
export const nativeAgentMessageScope = agentMessageCursorScope(
  nativeAgentFixtureAgentId,
  conversationId,
)
const firstPageEndCursor = encodeScopedUuidCursor(
  '00000000-0000-7000-8000-000000000201',
  nativeAgentMessageScope,
)

const conversation = {
  id: conversationId,
  channel_type: 'agent',
  title: 'Fixture agent conversation',
  created_at: '2026-07-01T10:00:00Z',
  created_by_id: null,
  updated_at: '2026-07-01T10:02:00Z',
  updated_by_id: null,
  deleted_at: null,
  deleted_by_id: null,
  last_response_id: '00000000-0000-7000-8000-000000000202',
}

function message(
  id: string,
  createdAt: string,
  role: string,
  content: string,
  createdById: string | null = '00000000-0000-7000-8000-000000000001',
) {
  return {
    id,
    conversation_id: conversationId,
    created_at: createdAt,
    created_by_id: createdById,
    updated_at: createdAt,
    updated_by_id: null,
    deleted_at: null,
    deleted_by_id: null,
    content: { role, content },
  }
}

const shared = {
  method: 'GET' as const,
  path: `/api/v1/agents/helper/conversations/${conversationId}`,
  route: {
    routeTemplate: '/api/v1/agents/:idOrSlug/conversations/:conversationId',
    pathParams: { idOrSlug: 'helper', conversationId },
  },
  auth: 'fixture-admin' as const,
  status: 200,
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'] as const,
  migratedFrom: ['backend/api/v1/agents/agent-conversations.mts'],
}

export const nativeAgentConversationApiFixtureCases: ApiFixtureCase[] = [
  ...nativeAgentListApiFixtureCases,
  {
    ...shared,
    consumers: [...shared.consumers],
    id: 'native.agents.conversation.default',
    query: { limit: '2' },
    body: {
      conversation,
      results: [
        message(
          '00000000-0000-7000-8000-000000000201',
          '2026-07-01T10:01:00Z',
          'user',
          'Hello',
          null,
        ),
        message('00000000-0000-7000-8000-000000000202', '2026-07-01T10:02:00Z', 'assistant', 'Hi'),
      ],
      page_info: {
        has_next_page: true,
        start_cursor: encodeScopedUuidCursor(
          '00000000-0000-7000-8000-000000000202',
          nativeAgentMessageScope,
        ),
        end_cursor: firstPageEndCursor,
      },
    },
  },
  {
    ...shared,
    consumers: [...shared.consumers],
    id: 'native.agents.conversation.page-2',
    query: { after: firstPageEndCursor, limit: '2' },
    body: {
      conversation,
      results: [
        message(
          '00000000-0000-7000-8000-000000000200',
          '2026-07-01T10:00:00Z',
          'user',
          'Earlier context',
        ),
      ],
      page_info: {
        has_next_page: false,
        start_cursor: encodeScopedUuidCursor(
          '00000000-0000-7000-8000-000000000200',
          nativeAgentMessageScope,
        ),
        end_cursor: null,
      },
    },
  },
]
