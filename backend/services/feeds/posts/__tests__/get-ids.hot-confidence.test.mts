import { describe, expect, it } from 'vitest'
import { createTestPostId } from '@voucha/test-helpers/entities/post-ids'
import {
  createRandomString,
  deleteTestPost,
  createTestUser,
  createTestPost,
  hidePost,
  followUser,
  insertPostFeedShareForTest,
  insertTestPost,
  setTestPostVoteScores,
} from '@voucha/test-helpers'
import { getPostFeedIds } from '../get-ids.mts'

describe('hot post feed', () => {
  it('ranks direct and shared deliveries by confidence and excludes nonpositive support', async () => {
    const viewer = await createTestUser()
    const author = await createTestUser()
    const sharer = await createTestUser()
    await followUser(viewer, author)
    const suffix = createRandomString(10)
    const createdAt = new Date('9999-12-31T23:59:59.000Z')
    const ids: string[] = []
    try {
      for (const name of ['confidence', 'net', 'zero', 'negative']) {
        const postId = createTestPostId(createdAt)
        ids.push(postId)
        await insertTestPost({
          id: postId,
          title: `${name} ${suffix}`,
          slug: `hot-feed-${name}-${suffix}`,
          markdown: 'hot feed fixture',
          createdById: author.id,
          createdAt,
        })
      }
      await Promise.all([
        setTestPostVoteScores(ids[0]!, 5, 0),
        setTestPostVoteScores(ids[1]!, 100, 90),
        setTestPostVoteScores(ids[2]!, 1, 1),
        setTestPostVoteScores(ids[3]!, 1, 2),
        ...ids.map(postId =>
          insertPostFeedShareForTest({
            recipientUserId: viewer.id,
            sharedByUserId: sharer.id,
            postId,
          }),
        ),
      ])
      const options = { feed_type: 'follow_users' as const, min_score_follow_users: -10 }
      const first = await getPostFeedIds(viewer, { ...options, sort: 'hot', limit: 2 })
      expect(first.results.map(row => row.entity_id)).toEqual([ids[0], ids[0]])
      expect(first.page_info.has_next_page).toBe(true)
      const second = await getPostFeedIds(viewer, {
        ...options,
        sort: 'hot',
        limit: 2,
        after: first.page_info.end_cursor!,
      })
      expect(second.results.map(row => row.entity_id)).toEqual([ids[1], ids[1]])
      expect(second.page_info.has_next_page).toBe(false)
      const recent = await getPostFeedIds(viewer, { ...options, sort: 'new', limit: 20 })
      expect(new Set(recent.results.map(row => row.entity_id))).toEqual(new Set(ids))
    } finally {
      await Promise.all(ids.map(id => deleteTestPost(id)))
    }
  })

  it('keeps the hidden-comment exemption without bypassing positive-net hot eligibility', async () => {
    const viewer = await createTestUser()
    const author = await createTestUser()
    await followUser(viewer, author)
    const root = await createTestPost({ user: author })
    const comments = await Promise.all(
      Array.from({ length: 3 }, () =>
        createTestPost({ user: author, post_type: 'comment', parent_post_id: root.id }),
      ),
    )
    await Promise.all([
      ...comments.map(comment => hidePost(viewer, comment)),
      setTestPostVoteScores(comments[0]!.id, 1, 0),
      setTestPostVoteScores(comments[1]!.id, 1, 1),
      setTestPostVoteScores(comments[2]!.id, 1, 2),
    ])
    const options = {
      feed_type: 'follow_users' as const,
      post_types: ['comment' as const],
      min_score_follow_users: -10,
      limit: 10,
    }
    const recent = await getPostFeedIds(viewer, { ...options, sort: 'new' })
    expect(recent.results.map(row => row.entity_id).toSorted()).toEqual(
      comments.map(comment => comment.id).toSorted(),
    )
    const hot = await getPostFeedIds(viewer, { ...options, sort: 'hot' })
    expect(hot.results.map(row => row.entity_id)).toEqual([comments[0]!.id])
  })
})
