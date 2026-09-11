import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestDirectConversation, createTestUser } from '@voucha/test-helpers'
import { decodeCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'

type ConversationPage = {
  results: Array<{ id: string }>
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

describe('direct-message inbox cursor behavior', () => {
  let emptyUser: PrivateUser

  beforeAll(async () => {
    emptyUser = await createTestUser()
  })

  it('returns canonical empty-page metadata', async () => {
    const page = await getInbox(emptyUser, 'limit=2')

    expect(page).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
  })

  it('distinguishes partial, exact-limit, and multi-page results without gaps', async () => {
    const partialUser = await createTestUser()
    const partialPeer = await createTestUser()
    const partialConversation = await createTestDirectConversation({
      user1Id: partialUser.id,
      user2Id: partialPeer.id,
      updatedAt: '2026-07-01T10:00:00.000001Z',
    })
    const partial = await getInbox(partialUser, 'limit=2')
    expect(partial.results.map(result => result.id)).toEqual([partialConversation.id])
    expect(partial.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(partial.page_info.start_cursor).toBeTruthy()

    const exactUser = await createTestUser()
    const exactPeers = await Promise.all([createTestUser(), createTestUser()])
    await Promise.all(
      exactPeers.map((peer, index) =>
        createTestDirectConversation({
          user1Id: exactUser.id,
          user2Id: peer!.id,
          updatedAt: `2026-07-01T10:00:0${index}.000001Z`,
        }),
      ),
    )
    const exact = await getInbox(exactUser, 'limit=2')
    expect(exact.results).toHaveLength(2)
    expect(exact.page_info).toMatchObject({ has_next_page: false, end_cursor: null })

    const pagedUser = await createTestUser()
    const pagedPeers = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const conversations = await Promise.all(
      pagedPeers.map((peer, index) =>
        createTestDirectConversation({
          user1Id: pagedUser.id,
          user2Id: peer!.id,
          updatedAt: `2026-07-01T10:00:0${index}.000001Z`,
        }),
      ),
    )
    const first = await getInbox(pagedUser, 'limit=2')
    expect(first.page_info.has_next_page).toBe(true)
    expect(first.page_info.end_cursor).toBeTruthy()
    const second = await getInbox(
      pagedUser,
      `limit=2&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
    )
    expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const ids = [...first.results, ...second.results].map(result => result.id)
    expect(new Set(ids)).toEqual(new Set(conversations.map(conversation => conversation.id)))
  })

  it('uses the UUID tie-breaker when activity timestamps are equal', async () => {
    const user = await createTestUser()
    const peers = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const conversations = await Promise.all(
      peers.map(peer =>
        createTestDirectConversation({
          user1Id: user.id,
          user2Id: peer!.id,
          updatedAt: '2026-07-01T10:00:00.123456Z',
        }),
      ),
    )

    const first = await getInbox(user, 'limit=2')
    const second = await getInbox(
      user,
      `limit=2&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
    )
    const ids = [...first.results, ...second.results].map(result => result.id)
    expect(new Set(ids)).toEqual(new Set(conversations.map(conversation => conversation.id)))
    expect(ids).toEqual([...ids].sort().reverse())
  })

  it('does not collapse conversations within the same millisecond', async () => {
    const user = await createTestUser()
    const [olderPeer, newerPeer] = await Promise.all([createTestUser(), createTestUser()])
    const older = await createTestDirectConversation({
      user1Id: user.id,
      user2Id: olderPeer!.id,
      updatedAt: '2026-07-01T10:00:00.000001Z',
    })
    const newer = await createTestDirectConversation({
      user1Id: user.id,
      user2Id: newerPeer!.id,
      updatedAt: '2026-07-01T10:00:00.000999Z',
    })

    const first = await getInbox(user, 'limit=1')
    expect(first.results.map(result => result.id)).toEqual([newer.id])
    const cursor = decodeCursor(first.page_info.end_cursor!)
    expect(cursor).toMatchObject({ timestamp: '2026-07-01T10:00:00.000999Z', id: newer.id })
    const second = await getInbox(
      user,
      `limit=1&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
    )
    expect(second.results.map(result => result.id)).toEqual([older.id])
  })

  it('keeps user scope when a valid cursor is replayed by another inbox', async () => {
    const [sourceUser, targetUser, sourcePeer, targetPeer] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const source = await createTestDirectConversation({
      user1Id: sourceUser!.id,
      user2Id: sourcePeer!.id,
      updatedAt: '2026-07-01T10:00:02.000001Z',
    })
    const target = await createTestDirectConversation({
      user1Id: targetUser!.id,
      user2Id: targetPeer!.id,
      updatedAt: '2026-07-01T10:00:01.000001Z',
    })
    const sourcePage = await getInbox(sourceUser!, 'limit=1')
    const replay = await getInbox(
      targetUser!,
      `limit=10&after=${encodeURIComponent(sourcePage.page_info.start_cursor!)}`,
    )

    expect(replay.results.map(result => result.id)).toContain(target.id)
    expect(replay.results.map(result => result.id)).not.toContain(source.id)
  })
})

async function getInbox(user: PrivateUser, query: string): Promise<ConversationPage> {
  const request = createRequest()
  await request.authenticateAs(user)
  const response = await request.get(`/api/v1/my/messages?${query}`).expect(200)
  return response.body as ConversationPage
}
