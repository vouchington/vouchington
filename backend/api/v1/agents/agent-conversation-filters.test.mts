import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestAgent,
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import type { PrivateUser } from '@services/users/types'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { agentConversationListCursorScope } from '../../../modules/agents/index.mjs'

describe('agent conversation filters', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let agentSlug: string
  let agentSystemUserId: string
  let secondAgentSlug: string
  let linkedConvId: string
  let otherUserLinkedConvId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    agentSlug = agent.slug!
    agentSystemUserId = agent.system_user_id
    secondAgentSlug = (await createTestAgent({ agentType: 'moderator', activated: true })).slug!
    linkedConvId = await createLinkedConversation(regularUser, 'linked')
    const otherUser = await createTestUser()
    otherUserLinkedConvId = await createLinkedConversation(otherUser, 'other-linked')
  })

  it.each([
    ['username', 'unknown-agent-conversation-user'],
    ['post_slug', 'unknown-agent-conversation-post'],
  ] as const)('returns an empty page for an unresolved %s selector', async (selector, value) => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/agents/${agentSlug}/conversations`)
      .query({ [selector]: value })
      .expect(200)

    expect(response.body).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      users: {},
    })
  })

  it('keeps an explicit user ID filter authoritative over an unknown username', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/agents/${agentSlug}/conversations`)
      .query({ user_id: regularUser.id, username: 'unknown-agent-conversation-user' })
      .expect(200)

    const ids = response.body.results.map((conversation: { id: string }) => conversation.id)
    expect(ids).toContain(linkedConvId)
    expect(ids).not.toContain(otherUserLinkedConvId)
  })

  it('keeps an explicit post ID filter authoritative over an unknown post slug', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const postId = crypto.randomUUID()
    const after = encodeScopedUuidCursor(
      crypto.randomUUID(),
      agentConversationListCursorScope({ agentSystemUserId, postId, onlyLinked: true }),
    )
    const response = await request
      .get(`/api/v1/agents/${agentSlug}/conversations`)
      .query({ after, post_id: postId, post_slug: 'unknown-agent-conversation-post' })
      .expect(200)

    expect(response.body.results).toEqual([])
  })

  it('rejects unrelated cursors for both unresolved textual selectors', async () => {
    await Promise.all(
      ['unresolved-a', 'unresolved-b'].map(label => createLinkedConversation(regularUser, label)),
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    const firstPage = await request
      .get(`/api/v1/agents/${agentSlug}/conversations`)
      .query({ limit: 1 })
      .expect(200)

    for (const [selector, value] of [
      ['username', 'unknown-agent-conversation-user'],
      ['post_slug', 'unknown-agent-conversation-post'],
    ] as const) {
      await request
        .get(`/api/v1/agents/${agentSlug}/conversations`)
        .query({ after: firstPage.body.page_info.end_cursor, limit: 1, [selector]: value })
        .expect(400)
    }
  })

  it.each([
    ['username', 'unknown-agent-conversation-user'],
    ['post_slug', 'unknown-agent-conversation-post'],
  ] as const)(
    'accepts an unresolved %s cursor with normalized textual scope',
    async (selector, value) => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const after = encodeScopedUuidCursor(
        crypto.randomUUID(),
        agentConversationListCursorScope({
          agentSystemUserId,
          onlyLinked: true,
          unresolvedTextFilters: [{ kind: selector, value }],
        }),
      )
      const response = await request
        .get(`/api/v1/agents/${agentSlug}/conversations`)
        .query({ after, [selector]: `  ${value.toUpperCase()}  ` })
        .expect(200)

      expect(response.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    },
  )

  it('rejects cursors replayed for another agent or filter scope', async () => {
    await Promise.all(
      ['scope-a', 'scope-b'].map(label => createLinkedConversation(regularUser, label)),
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    const firstPage = await request
      .get(`/api/v1/agents/${agentSlug}/conversations`)
      .query({ limit: 1 })
      .expect(200)
    const after = firstPage.body.page_info.end_cursor as string

    await request
      .get(`/api/v1/agents/${secondAgentSlug}/conversations`)
      .query({ after, limit: 1 })
      .expect(400)
    await request
      .get(`/api/v1/agents/${agentSlug}/conversations`)
      .query({ after, limit: 1, user_id: regularUser.id })
      .expect(400)
  })

  async function createLinkedConversation(user: PrivateUser, label: string): Promise<string> {
    const conversation = await createConversation(user.id, `${label} ${crypto.randomUUID()}`)
    await createConversationMessage(conversation.id, agentSystemUserId, {
      role: 'assistant',
      content: label,
    })
    const contact = await insertTestSupportContact({
      emailAddress: `tests+agent-${label}-${crypto.randomUUID()}@voucha.ai`,
      userId: user.id,
    })
    await insertTestSupportThread({ supportContactId: contact.id, conversationId: conversation.id })
    return conversation.id
  }
})
