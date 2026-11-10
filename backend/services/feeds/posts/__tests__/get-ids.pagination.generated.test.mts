import { it, expect, describe } from 'vitest'
import { getPostFeedIds } from '../get-ids.mts'
import { encodeCursor } from '@modules/pagination'
import { followUser, createTestUser, createTestPost } from '@voucha/test-helpers'
import {
  processFollowerDistributionChunk,
  sharePostWithFollowers,
} from '@services/follower-distributions'

describe('getPostFeedIds (pagination)', () => {
  it('pagination works with end_cursor', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()

    await followUser(user, followedUser)

    const expected = []
    for (let index = 0; index < 3; index++) {
      expected.push((await createTestPost({ user: followedUser })).id)
    }
    const seen: string[] = []
    let after: string | undefined
    for (let pageIndex = 0; pageIndex < 30; pageIndex++) {
      const page = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 1, after })
      seen.push(...page.results.map(row => row.id))
      if (seen.length === expected.length || !page.page_info.has_next_page) break
      const next = page.page_info.end_cursor
      if (!next || next === after) throw new Error('Expected advancing continuation cursor')
      after = next
    }
    expect(seen.toSorted()).toEqual(expected.toSorted())
    expect(new Set(seen).size).toBe(expected.length)
  })

  it('rejects a malformed or obsolete cursor', async () => {
    const user = await createTestUser()

    await expect(
      getPostFeedIds(user, {
        after: encodeCursor({
          timestamp: new Date().toISOString().replace('Z', '000Z'),
          id: 'not-a-uuid',
        }),
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Invalid cursor: id is not a valid UUID',
    })
  })

  it('returns shared posts in follow_users with share metadata', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const creator = await createTestUser()

    await followUser(follower, sharer)

    const post = await createTestPost({ user: creator, privacy: 'public' })
    await processFollowerDistributionChunk(
      (await sharePostWithFollowers(sharer, post.id)).distribution_id,
    )

    const result = await getPostFeedIds(follower, { feed_type: 'follow_users', limit: 10 })
    const sharedPost = result.results.find(
      row => row.entity_id === post.id && row.delivery_type === 'share',
    )

    expect(sharedPost).toBeDefined()
    expect(sharedPost?.shared_by_id).toBe(sharer.id)
    expect(sharedPost?.post_type).toBe(post.post_type)
  })
})
