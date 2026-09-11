import { describe, expect, it } from 'vitest'
import { decodeCursor, decodeScopedUuidCursor } from '@modules/pagination'
import {
  nativeAgentConversationApiFixtureCases,
  nativeAgentMessageScope,
} from './native-agent-conversation-cases.mts'
import {
  nativeAgentConversationListScope,
  nativeAgentFilteredUsernameConversationScope,
} from './native-agent-list-cases.mts'
import { AGENT_DIRECTORY_CURSOR_SCOPE } from '@modules/agents'

describe('native agent conversation cursor fixtures', () => {
  it('represents deleted conversation creators without a user sidecar entry', () => {
    const page = fixture('native.agents.conversations.default')
    const body = page.body as {
      results: Array<{ created_by_id: string | null }>
      users: Record<string, unknown>
    }

    expect(body.results[0]?.created_by_id).toBeNull()
    expect(body.users).not.toHaveProperty('null')
  })

  it('provides a typed agent detail response with optional slug and moderator fields', () => {
    const detail = fixture('native.agents.detail.default')
    const body = detail.body as {
      agent: {
        id: string
        system_user_id: string
        slug: string
        moderator: { agent_id: string; created_at: string; updated_at: string }
      }
      user: { id: string }
    }

    expect(detail).toMatchObject({
      method: 'GET',
      path: '/api/v1/agents/helper',
      route: {
        routeTemplate: '/api/v1/agents/:idOrSlug',
        pathParams: { idOrSlug: 'helper' },
      },
      consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    })
    expect(body.agent.moderator).toEqual({
      agent_id: body.agent.id,
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
    })
    expect(body.agent.slug).toBe('helper')
    expect(body.user.id).toBe(body.agent.system_user_id)
  })

  it('scopes username-filtered conversation cursors to the resolved user ID', () => {
    const filteredPage = fixture('native.agents.conversations.filtered-username')
    const body = filteredPage.body as {
      results: Array<{ id: string; created_by_id: string }>
      page_info: { end_cursor: string }
    }

    expect(filteredPage).toMatchObject({
      method: 'GET',
      path: '/api/v1/agents/helper/conversations',
      route: {
        routeTemplate: '/api/v1/agents/:idOrSlug/conversations',
        pathParams: { idOrSlug: 'helper' },
      },
      query: { username: 'fixture-agent-user-011', limit: '2' },
      consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    })
    expect(body.results.map(result => result.created_by_id)).toEqual([
      '00000000-0000-7000-8000-000000000011',
      '00000000-0000-7000-8000-000000000011',
    ])
    expect(
      decodeScopedUuidCursor(
        body.page_info.end_cursor,
        nativeAgentFilteredUsernameConversationScope,
        'Invalid fixture cursor',
      ),
    ).toEqual({
      id: body.results.at(-1)!.id,
      scope: nativeAgentFilteredUsernameConversationScope,
    })
  })

  it('uses exact opaque simple cursors for reverse-history continuation', () => {
    const firstPage = fixture('native.agents.conversation.default')
    const secondPage = fixture('native.agents.conversation.page-2')
    const firstBody = firstPage!.body as {
      page_info: { start_cursor: string; end_cursor: string }
      results: { id: string }[]
    }
    const secondBody = secondPage!.body as {
      page_info: { start_cursor: string; end_cursor: null }
      results: { id: string }[]
    }

    expect(decodeCursor(firstBody.page_info.start_cursor)).toEqual({
      id: firstBody.results.at(-1)!.id,
      scope: nativeAgentMessageScope,
    })
    expect(
      decodeScopedUuidCursor(
        firstBody.page_info.end_cursor,
        nativeAgentMessageScope,
        'Invalid fixture cursor',
      ),
    ).toEqual({
      id: firstBody.results[0]!.id,
      scope: nativeAgentMessageScope,
    })
    expect(secondPage!.query!.after).toBe(firstBody.page_info.end_cursor)
    expect(
      decodeScopedUuidCursor(
        secondBody.page_info.start_cursor,
        nativeAgentMessageScope,
        'Invalid fixture cursor',
      ),
    ).toEqual({
      id: secondBody.results.at(-1)!.id,
      scope: nativeAgentMessageScope,
    })
    expect(secondBody.page_info.end_cursor).toBeNull()
  })

  it.each([
    ['native.agents.default', 'native.agents.page-2', AGENT_DIRECTORY_CURSOR_SCOPE],
    [
      'native.agents.conversations.default',
      'native.agents.conversations.page-2',
      nativeAgentConversationListScope,
    ],
  ])(
    'connects %s to its continuation fixture with an opaque simple cursor',
    (firstId, secondId, cursorScope) => {
      const firstPage = fixture(firstId)
      const secondPage = fixture(secondId)
      const firstBody = firstPage.body as {
        page_info: { end_cursor: string }
        results: { id: string }[]
      }

      expect(
        decodeScopedUuidCursor(
          firstBody.page_info.end_cursor,
          cursorScope,
          'Invalid fixture cursor',
        ),
      ).toEqual({ id: firstBody.results.at(-1)!.id, scope: cursorScope })
      expect(secondPage.query!.after).toBe(firstBody.page_info.end_cursor)
      expect(firstBody.results.length).toBeLessThanOrEqual(Number(firstPage.query!.limit))
      expect((secondPage.body as { results: unknown[] }).results.length).toBeLessThanOrEqual(
        Number(secondPage.query!.limit),
      )
    },
  )

  it.each([
    ['native.agents.default', 'native.agents.page-2', 'system_user_id'],
    ['native.agents.conversations.default', 'native.agents.conversations.page-2', 'created_by_id'],
  ] as const)(
    'covers every %s result reference with page-local user sidecars',
    (firstId, secondId, userIdField) => {
      const firstBody = listBody(firstId)
      const secondBody = listBody(secondId)

      expect(Object.keys(firstBody.users).toSorted()).toEqual(
        firstBody.results
          .map(result => result[userIdField])
          .filter((userId): userId is string => typeof userId === 'string')
          .toSorted(),
      )
      expect(Object.keys(secondBody.users).toSorted()).toEqual(
        secondBody.results
          .map(result => result[userIdField])
          .filter((userId): userId is string => typeof userId === 'string')
          .toSorted(),
      )
      expect(
        new Set(Object.keys(firstBody.users)).isDisjointFrom(
          new Set(Object.keys(secondBody.users)),
        ),
      ).toBe(true)
    },
  )
})

function fixture(id: string) {
  return nativeAgentConversationApiFixtureCases.find(candidate => candidate.id === id)!
}

function listBody(id: string) {
  return fixture(id).body as {
    results: Array<{ system_user_id: string; created_by_id: string | null }>
    users: Record<string, { id: string }>
  }
}
