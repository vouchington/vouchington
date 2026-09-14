import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestDirectConversation,
  createTestDirectMessage,
  createTestGroupConversation,
  createTestUser,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type Page<T> = {
  results: T[]
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

describe('direct-message thread and participant cursor behavior', () => {
  it('returns canonical empty and partial message pages', async () => {
    const [user, peer] = await users(2)
    const emptyConversation = await createTestDirectConversation({
      user1Id: user.id,
      user2Id: peer.id,
    })
    const empty = await getMessages(user, emptyConversation.id, 'limit=2')
    expect(empty).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    const message = await createTestDirectMessage({
      conversationId: emptyConversation.id,
      createdById: user.id,
      bodyText: 'only',
    })
    const partial = await getMessages(user, emptyConversation.id, 'limit=2')
    expect(partial.results.map(result => result.id)).toEqual([message.id])
    expect(partial.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(partial.page_info.start_cursor).toBeTruthy()
  })

  it('distinguishes exact-limit and multi-page messages in chronological order', async () => {
    const [user, peer] = await users(2)
    const exactConversation = await createTestDirectConversation({
      user1Id: user.id,
      user2Id: peer.id,
    })
    const exactMessages = []
    for (const bodyText of ['first', 'second']) {
      exactMessages.push(
        await createTestDirectMessage({
          conversationId: exactConversation.id,
          createdById: user.id,
          bodyText,
        }),
      )
    }
    const exact = await getMessages(user, exactConversation.id, 'limit=2')
    expect(exact.results.map(result => result.id)).toEqual(exactMessages.map(message => message.id))
    expect(exact.page_info).toMatchObject({ has_next_page: false, end_cursor: null })

    const pagedConversation = await createTestDirectConversation({
      user1Id: user.id,
      user2Id: peer.id,
    })
    const messages = []
    for (const bodyText of ['oldest', 'middle', 'newest']) {
      messages.push(
        await createTestDirectMessage({
          conversationId: pagedConversation.id,
          createdById: user.id,
          bodyText,
        }),
      )
    }
    const first = await getMessages(user, pagedConversation.id, 'limit=2')
    expect(first.results.map(result => result.id)).toEqual(
      messages.slice(1).map(message => message.id),
    )
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getMessages(
      user,
      pagedConversation.id,
      `limit=2&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
    )
    expect(second.results.map(result => result.id)).toEqual([messages[0]!.id])
    expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('uses UUID order as the unique message tie-breaker', async () => {
    const [user, peer] = await users(2)
    const conversation = await createTestDirectConversation({
      user1Id: user.id,
      user2Id: peer.id,
    })
    const messages = await Promise.all(
      ['one', 'two', 'three'].map(bodyText =>
        createTestDirectMessage({
          conversationId: conversation.id,
          createdById: user.id,
          bodyText,
        }),
      ),
    )
    const first = await getMessages(user, conversation.id, 'limit=2')
    const second = await getMessages(
      user,
      conversation.id,
      `limit=2&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
    )
    const ids = [...second.results, ...first.results].map(result => result.id)
    expect(new Set(ids)).toEqual(new Set(messages.map(message => message.id)))
    expect(ids).toEqual([...ids].sort())
  })

  it('keeps conversation scope when a valid message cursor is replayed', async () => {
    const [user, firstPeer, secondPeer] = await users(3)
    const [firstConversation, secondConversation] = await Promise.all([
      createTestDirectConversation({ user1Id: user.id, user2Id: firstPeer.id }),
      createTestDirectConversation({ user1Id: user.id, user2Id: secondPeer.id }),
    ])
    const firstMessage = await createTestDirectMessage({
      conversationId: firstConversation.id,
      createdById: user.id,
      bodyText: 'first scope',
    })
    const secondMessage = await createTestDirectMessage({
      conversationId: secondConversation.id,
      createdById: user.id,
      bodyText: 'second scope',
    })
    const firstPage = await getMessages(user, firstConversation.id, 'limit=2')
    const replay = await getMessages(
      user,
      secondConversation.id,
      `limit=10&after=${encodeURIComponent(firstPage.page_info.start_cursor!)}`,
    )
    expect(replay.results.map(result => result.id)).not.toContain(firstMessage.id)
    expect(replay.results.every(result => result.conversation_id === secondConversation.id)).toBe(
      true,
    )
    expect(
      replay.results.length === 0 ||
        replay.results.map(result => result.id).includes(secondMessage.id),
    ).toBe(true)
  })

  it('distinguishes partial, exact-limit, and multi-page participant results', async () => {
    const [owner, member1, member2] = await users(3)
    const partialConversation = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [],
    })
    const partial = await getParticipants(owner, partialConversation.id, 'limit=2')
    expect(partial.results.map(result => result.user_id)).toEqual([owner.id])
    expect(partial.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(partial.page_info.start_cursor).toBeTruthy()

    const exactConversation = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member1.id],
    })
    const exact = await getParticipants(owner, exactConversation.id, 'limit=2')
    expect(exact.results).toHaveLength(2)
    expect(exact.page_info).toMatchObject({ has_next_page: false, end_cursor: null })

    const pagedConversation = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member1.id, member2.id],
    })
    const first = await getParticipants(owner, pagedConversation.id, 'limit=2')
    expect(first.results).toHaveLength(2)
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getParticipants(
      owner,
      pagedConversation.id,
      `limit=2&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
    )
    expect(second.results).toHaveLength(1)
    expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(new Set([...first.results, ...second.results].map(result => result.user_id))).toEqual(
      new Set([owner.id, member1.id, member2.id]),
    )
  })

  it('keeps conversation scope when a valid participant cursor is replayed', async () => {
    const [owner, sourceMember, targetMember] = await users(3)
    const source = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [sourceMember.id],
    })
    const target = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [targetMember.id],
    })
    const sourcePage = await getParticipants(owner, source.id, 'limit=1')
    const replay = await getParticipants(
      owner,
      target.id,
      `limit=10&after=${encodeURIComponent(sourcePage.page_info.end_cursor!)}`,
    )

    expect(replay.results.map(result => result.user_id)).toContain(targetMember.id)
    expect(replay.results.map(result => result.user_id)).not.toContain(sourceMember.id)
    expect(replay.results.every(result => result.conversation_id === target.id)).toBe(true)
  })
})

async function users(count: number): Promise<PrivateUser[]> {
  return Promise.all(Array.from({ length: count }, async () => await createTestUser()))
}

async function getMessages(
  user: PrivateUser,
  conversationId: string,
  query: string,
): Promise<Page<{ id: string; conversation_id: string }>> {
  const request = createRequest()
  await request.authenticateAs(user)
  const response = await request
    .get(`/api/v1/my/messages/${conversationId}/messages?${query}`)
    .expect(200)
  return response.body as Page<{ id: string; conversation_id: string }>
}

async function getParticipants(
  user: PrivateUser,
  conversationId: string,
  query: string,
): Promise<Page<{ id: string; user_id: string; conversation_id: string }>> {
  const request = createRequest()
  await request.authenticateAs(user)
  const response = await request
    .get(`/api/v1/my/messages/${conversationId}/participants?${query}`)
    .expect(200)
  return response.body as Page<{ id: string; user_id: string; conversation_id: string }>
}
