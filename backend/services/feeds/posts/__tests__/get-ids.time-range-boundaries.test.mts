import { randomInt, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils'
import {
  createTestUser,
  followUser,
  insertPostFeedShareForTest,
  insertTestPost,
} from '@voucha/test-helpers'
import { getPostFeedIds } from '../get-ids.mts'

const DAY_MS = 24 * 60 * 60 * 1000

function isRequestedPostIdCollision(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const postgresError = error as { code?: unknown; constraint?: unknown }
  return (
    postgresError.code === '23505' &&
    typeof postgresError.constraint === 'string' &&
    /^posts(?:__[a-z0-9_]+)?_pkey$/.test(postgresError.constraint)
  )
}

async function collectOwned(
  viewer: Parameters<typeof getPostFeedIds>[0],
  options: NonNullable<Parameters<typeof getPostFeedIds>[1]>,
  asOf: Date,
  expectedIds: readonly string[],
) {
  const rows: Awaited<ReturnType<typeof getPostFeedIds>>['results'] = []
  let after: string | undefined
  let found = false
  for (let index = 0; index < 80; index++) {
    const page = await getPostFeedIds(viewer, { ...options, after }, asOf)
    rows.push(...page.results)
    if (found || !page.page_info.has_next_page) break
    found = expectedIds.every(id => rows.some(row => row.id === id))
    const next = page.page_info.end_cursor ?? undefined
    if (!next || next === after) throw new Error('Expected advancing feed cursor')
    after = next
  }
  return rows
}

describe('post feed decision instant', () => {
  it('rejects a non-finite explicit decision instant', async () => {
    const viewer = await createTestUser()
    await expect(
      getPostFeedIds(viewer, { feed_type: 'follow_users', time_range: '1d' }, new Date(Number.NaN)),
    ).rejects.toThrow('Invalid feed decision instant')
  })

  it('uses one inclusive cutoff for direct UUIDs and shared delivery timestamps', async () => {
    const viewer = await createTestUser()
    const followedCreator = await createTestUser()
    const sharedTargetCreator = await createTestUser()
    await followUser(viewer, followedCreator)

    let cutoffMs = 0
    let equalPostId: string | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      cutoffMs = Date.now() - randomInt(1, 12 * 60 * 60 * 1000)
      const candidate = getMinUUIDv7ForDate(new Date(cutoffMs))
      try {
        equalPostId = await insertTestPost({
          id: candidate,
          title: 'Feed equal-cutoff direct post',
          slug: randomUUID(),
          markdown: 'Equal-cutoff post',
          createdById: followedCreator.id,
        })
        if (equalPostId !== candidate) throw new Error('Post fixture returned a different ID')
        break
      } catch (err) {
        if (!isRequestedPostIdCollision(err)) throw err
      }
    }
    if (!equalPostId) throw new Error('Unable to reserve an owned direct cutoff post ID')

    const olderId = await insertTestPost({
      createdAt: new Date(cutoffMs - 1),
      title: 'Feed older direct post',
      slug: randomUUID(),
      markdown: 'Older post',
      createdById: followedCreator.id,
    })
    const newerId = await insertTestPost({
      createdAt: new Date(cutoffMs + 1),
      title: 'Feed newer direct post',
      slug: randomUUID(),
      markdown: 'Newer post',
      createdById: followedCreator.id,
    })
    const targetId = await insertTestPost({
      createdAt: new Date(cutoffMs - DAY_MS),
      title: 'Shared target independent of delivery age',
      slug: randomUUID(),
      markdown: 'Shared target',
      createdById: sharedTargetCreator.id,
    })
    const shareIds: string[] = []
    for (const delta of [-1, 0, 1]) {
      shareIds.push(
        await insertPostFeedShareForTest({
          recipientUserId: viewer.id,
          sharedByUserId: sharedTargetCreator.id,
          postId: targetId,
          sortAt: new Date(cutoffMs + delta),
        }),
      )
    }
    const ownedIds = [olderId, equalPostId, newerId, ...shareIds]
    const asOf = new Date(cutoffMs + DAY_MS)
    const windowed = await collectOwned(
      viewer,
      { feed_type: 'follow_users', time_range: '1d', limit: 25 },
      asOf,
      [equalPostId, newerId, shareIds[1]!, shareIds[2]!],
    )
    expect(
      windowed
        .filter(row => ownedIds.includes(row.id))
        .map(row => row.id)
        .toSorted(),
    ).toEqual([equalPostId, newerId, shareIds[1], shareIds[2]].toSorted())
    expect(windowed.filter(row => shareIds.includes(row.id)).map(row => row.entity_id)).toEqual([
      targetId,
      targetId,
    ])

    const unbounded = await collectOwned(
      viewer,
      { feed_type: 'follow_users', time_range: 'all', limit: 25 },
      asOf,
      ownedIds,
    )
    expect(
      unbounded
        .filter(row => ownedIds.includes(row.id))
        .map(row => row.id)
        .toSorted(),
    ).toEqual(ownedIds.toSorted())
  })
})
