import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestDirectMessage,
  createTestModmailThread,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

type Page<T> = {
  results: T[]
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

describe('community modmail cursor behavior', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('returns canonical empty, partial, exact-limit, and multi-page inbox metadata', async () => {
    const emptyCommunity = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: emptyCommunity.id,
      userId: owner.id,
      role: 'owner',
    })
    expect(await getInbox(owner, emptyCommunity, 'limit=2')).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    const partialCommunity = await communityWithOwner(owner)
    const partialSubject = await createTestUser()
    const partialThread = await createTestModmailThread({
      communityId: partialCommunity.id,
      subjectUserId: partialSubject.id,
      modUserId: owner.id,
      updatedAt: '2026-07-01T10:00:00.000001Z',
    })
    const partial = await getInbox(owner, partialCommunity, 'limit=2')
    expect(partial.results.map(result => result.id)).toEqual([partialThread.id])
    expect(partial.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(partial.page_info.start_cursor).toBeTruthy()
    const exactCommunity = await communityWithOwner(owner)
    await createThreads(owner, exactCommunity, 2)
    const exact = await getInbox(owner, exactCommunity, 'limit=2')
    expect(exact.results).toHaveLength(2)
    expect(exact.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const pagedCommunity = await communityWithOwner(owner)
    const threads = await createThreads(owner, pagedCommunity, 3)
    const first = await getInbox(owner, pagedCommunity, 'limit=2')
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getInbox(
      owner,
      pagedCommunity,
      `limit=2&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
    )
    expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(new Set([...first.results, ...second.results].map(result => result.id))).toEqual(
      new Set(threads.map(thread => thread.id)),
    )
  })
  it('uses timestamp and UUID tie-breakers without same-millisecond gaps', async () => {
    const tieCommunity = await communityWithOwner(owner)
    const tieSubjects = await users(3)
    const sameTimestampThreads = await Promise.all(
      tieSubjects.map(subject =>
        createTestModmailThread({
          communityId: tieCommunity.id,
          subjectUserId: subject.id,
          modUserId: owner.id,
          updatedAt: '2026-07-01T10:00:00.123456Z',
        }),
      ),
    )
    const tieFirst = await getInbox(owner, tieCommunity, 'limit=2')
    const tieSecond = await getInbox(
      owner,
      tieCommunity,
      `limit=2&after=${encodeURIComponent(tieFirst.page_info.end_cursor!)}`,
    )
    const tieIds = [...tieFirst.results, ...tieSecond.results].map(result => result.id)
    expect(new Set(tieIds)).toEqual(new Set(sameTimestampThreads.map(thread => thread.id)))
    expect(tieIds).toEqual([...tieIds].sort().reverse())
    const preciseCommunity = await communityWithOwner(owner)
    const [olderSubject, newerSubject] = await users(2)
    const older = await createTestModmailThread({
      communityId: preciseCommunity.id,
      subjectUserId: olderSubject.id,
      modUserId: owner.id,
      updatedAt: '2026-07-01T10:00:00.000001Z',
    })
    const newer = await createTestModmailThread({
      communityId: preciseCommunity.id,
      subjectUserId: newerSubject.id,
      modUserId: owner.id,
      updatedAt: '2026-07-01T10:00:00.000999Z',
    })
    const preciseFirst = await getInbox(owner, preciseCommunity, 'limit=1')
    expect(preciseFirst.results.map(result => result.id)).toEqual([newer.id])
    const preciseSecond = await getInbox(
      owner,
      preciseCommunity,
      `limit=1&after=${encodeURIComponent(preciseFirst.page_info.end_cursor!)}`,
    )
    expect(preciseSecond.results.map(result => result.id)).toEqual([older.id])
  })
  it('keeps community and member filters when cursors are replayed', async () => {
    const sourceCommunity = await communityWithOwner(owner)
    const targetCommunity = await communityWithOwner(owner)
    const [sourceSubject, targetSubject] = await users(2)
    await Promise.all([
      insertTestCommunityMember({
        communityId: targetCommunity.id,
        userId: targetSubject.id,
        role: 'member',
      }),
      createTestModmailThread({
        communityId: sourceCommunity.id,
        subjectUserId: sourceSubject.id,
        modUserId: owner.id,
        updatedAt: '2026-07-01T10:00:02.000001Z',
      }),
    ])
    const targetThread = await createTestModmailThread({
      communityId: targetCommunity.id,
      subjectUserId: targetSubject.id,
      modUserId: owner.id,
      updatedAt: '2026-07-01T10:00:01.000001Z',
    })
    const sourcePage = await getInbox(owner, sourceCommunity, 'limit=1')
    const ownerReplay = await getInbox(
      owner,
      targetCommunity,
      `limit=10&after=${encodeURIComponent(sourcePage.page_info.start_cursor!)}`,
    )
    expect(ownerReplay.results.map(result => result.id)).toEqual([targetThread.id])
    const memberReplay = await getInbox(
      targetSubject,
      targetCommunity,
      `limit=10&after=${encodeURIComponent(sourcePage.page_info.start_cursor!)}`,
    )
    expect(memberReplay.results.map(result => result.id)).toEqual([targetThread.id])
  })

  it('paginates thread messages chronologically without gaps or duplicates', async () => {
    const subject = await createTestUser()
    const thread = await createTestModmailThread({
      communityId: community.id,
      subjectUserId: subject.id,
      modUserId: owner.id,
    })
    const messages = []
    for (const bodyText of ['oldest', 'middle', 'newest']) {
      messages.push(
        await createTestDirectMessage({
          conversationId: thread.id,
          createdById: owner.id,
          bodyText,
        }),
      )
    }
    const first = await getMessages(owner, community, thread.id, 'limit=2')
    expect(first.results.map(result => result.id)).toEqual(
      messages.slice(1).map(message => message.id),
    )
    const second = await getMessages(
      owner,
      community,
      thread.id,
      `limit=2&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
    )
    expect(second.results.map(result => result.id)).toEqual([messages[0]!.id])
    expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('returns canonical empty, partial, and exact-limit thread-message metadata', async () => {
    const subjects = await users(3)
    const threads = await Promise.all(
      subjects.map(subject =>
        createTestModmailThread({
          communityId: community.id,
          subjectUserId: subject.id,
          modUserId: owner.id,
        }),
      ),
    )

    expect(await getMessages(owner, community, threads[0]!.id, 'limit=2')).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    const partialMessage = await createTestDirectMessage({
      conversationId: threads[1]!.id,
      createdById: owner.id,
      bodyText: 'partial',
    })
    const partial = await getMessages(owner, community, threads[1]!.id, 'limit=2')
    expect(partial.results.map(result => result.id)).toEqual([partialMessage.id])
    expect(partial.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(partial.page_info.start_cursor).toBeTruthy()

    for (const bodyText of ['first', 'second']) {
      await createTestDirectMessage({
        conversationId: threads[2]!.id,
        createdById: owner.id,
        bodyText,
      })
    }
    const exact = await getMessages(owner, community, threads[2]!.id, 'limit=2')
    expect(exact.results).toHaveLength(2)
    expect(exact.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('keeps thread scope when a valid message cursor is replayed', async () => {
    const [sourceSubject, targetSubject] = await users(2)
    const [sourceThread, targetThread] = await Promise.all(
      [sourceSubject, targetSubject].map(subject =>
        createTestModmailThread({
          communityId: community.id,
          subjectUserId: subject.id,
          modUserId: owner.id,
        }),
      ),
    )
    const targetMessage = await createTestDirectMessage({
      conversationId: targetThread!.id,
      createdById: owner.id,
      bodyText: 'target',
    })
    const sourceMessage = await createTestDirectMessage({
      conversationId: sourceThread!.id,
      createdById: owner.id,
      bodyText: 'source',
    })
    const sourcePage = await getMessages(owner, community, sourceThread!.id, 'limit=1')
    const replay = await getMessages(
      owner,
      community,
      targetThread!.id,
      `limit=10&after=${encodeURIComponent(sourcePage.page_info.start_cursor!)}`,
    )

    expect(replay.results.map(result => result.id)).toContain(targetMessage.id)
    expect(replay.results.map(result => result.id)).not.toContain(sourceMessage.id)
    expect(replay.results.every(result => result.conversation_id === targetThread!.id)).toBe(true)
  })
})

async function communityWithOwner(owner: PrivateUser): Promise<Community> {
  const next = await insertTestCommunity({ createdById: owner.id })
  await insertTestCommunityMember({ communityId: next.id, userId: owner.id, role: 'owner' })
  return next
}

async function createThreads(owner: PrivateUser, target: Community, count: number) {
  const subjects = await users(count)
  return Promise.all(
    subjects.map((subject, index) =>
      createTestModmailThread({
        communityId: target.id,
        subjectUserId: subject.id,
        modUserId: owner.id,
        updatedAt: `2026-07-01T10:00:0${index}.000001Z`,
      }),
    ),
  )
}

async function users(count: number): Promise<PrivateUser[]> {
  return Promise.all(Array.from({ length: count }, async () => await createTestUser()))
}

async function getInbox(user: PrivateUser, target: Community, query: string) {
  return getPage<{ id: string }>(user, `/api/v1/communities/${target.slug}/modmail?${query}`)
}

async function getMessages(user: PrivateUser, target: Community, threadId: string, query: string) {
  return getPage<{ id: string; conversation_id: string }>(
    user,
    `/api/v1/communities/${target.slug}/modmail/${threadId}/messages?${query}`,
  )
}

async function getPage<T>(user: PrivateUser, path: string): Promise<Page<T>> {
  const request = createRequest()
  await request.authenticateAs(user)
  return (await request.get(path).expect(200)).body as Page<T>
}
