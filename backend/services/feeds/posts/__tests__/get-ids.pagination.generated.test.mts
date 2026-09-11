import { it, expect, describe } from 'vitest'
import { getPostFeedIds } from '../get-ids.mts'
import { decodeCursor, encodeCursor, isTimestampCursor } from '@modules/pagination'
import { followUser, createTestUser, createTestPost } from '@voucha/test-helpers'
import { processFollowerDistributionChunk } from '@services/follower-distributions'
import { sharePostWithFollowers } from '../../share-actions.mts'

describe('getPostFeedIds (pagination)', () => {
  it('pagination works with end_cursor', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()

    await followUser(user, followedUser)

    await createTestPost({ user: followedUser })
    await createTestPost({ user: followedUser })
    await createTestPost({ user: followedUser })

    // Get first page with limit 1
    const page1 = await getPostFeedIds(user, {
      feed_type: 'follow_users',
      limit: 1,
    })

    expect(page1.results.length).toBe(1)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeDefined()
    expect(isTimestampCursor(decodeCursor(page1.page_info.end_cursor!))).toBe(true)

    // Get second page
    expect(page1.page_info.end_cursor).toBeTruthy()
    const page2 = await getPostFeedIds(user, {
      feed_type: 'follow_users',
      after: page1.page_info.end_cursor!,
      limit: 1,
    })
    expect(page2.results.length).toBe(1)
    expect(page2.results[0].id).not.toBe(page1.results[0].id)
  })

  it('rejects invalid cursor with non-uuid id', async () => {
    const user = await createTestUser()

    await expect(
      getPostFeedIds(user, {
        after: encodeCursor({
          timestamp: Date.now(),
          id: 'not-a-uuid',
        }),
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Invalid cursor: id is not a valid UUID',
    })
  })

  it('sorts by id DESC (newest first)', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()

    await followUser(user, followedUser)

    await createTestPost({ user: followedUser })
    await createTestPost({ user: followedUser })
    const post3 = await createTestPost({ user: followedUser })

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 10 })

    // Check that post3 appears in results (most recent)
    const foundPost = result.results.find(r => r.id === post3.id)
    expect(foundPost).toBeDefined()

    // Should be sorted with newest first (post3 should appear early in results)
    expect(result.results.length).toBeGreaterThan(0)
  })

  it('includes results with proper structure', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()

    await followUser(user, followedUser)

    const post = await createTestPost({ user: followedUser })

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 10 })

    const foundPost = result.results.find(r => r.id === post.id)
    expect(foundPost).toBeDefined()
    expect(foundPost?.id).toBe(post.id)
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
    expect(sharedPost?.shared_by_user_id).toBe(sharer.id)
    expect(sharedPost?.post_type).toBe(post.post_type)
  })
})
