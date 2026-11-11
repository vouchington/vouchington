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

async function collectUntilEntities(
  viewer: Parameters<typeof getPostFeedIds>[0],
  options: NonNullable<Parameters<typeof getPostFeedIds>[1]>,
  expected: readonly string[],
) {
  const rows: Awaited<ReturnType<typeof getPostFeedIds>>['results'] = []
  let after: string | undefined
  for (let index = 0; index < 30; index++) {
    const page = await getPostFeedIds(viewer, { ...options, after })
    rows.push(...page.results)
    if (
      expected.every(
        (id, position) =>
          rows.filter(row => row.entity_id === id).length >=
          expected.slice(0, position + 1).filter(value => value === id).length,
      ) ||
      !page.page_info.has_next_page
    )
      break
    const next = page.page_info.end_cursor ?? undefined
    if (!next || next === after) throw new Error('Expected advancing feed cursor')
    after = next
  }
  return rows
}

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
      const expectedHot = [ids[0]!, ids[0]!, ids[1]!, ids[1]!]
      const hotRows = await collectUntilEntities(
        viewer,
        { ...options, sort: 'hot', limit: 2 },
        expectedHot,
      )
      expect(hotRows.map(row => row.entity_id)).toEqual(expectedHot)
      expect(new Set(hotRows.map(row => row.id)).size).toBe(expectedHot.length)
      const recent = await collectUntilEntities(viewer, { ...options, sort: 'new', limit: 20 }, ids)
      expect(new Set(recent.map(row => row.entity_id))).toEqual(new Set(ids))
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
    const recent = await collectUntilEntities(
      viewer,
      { ...options, sort: 'new' },
      comments.map(comment => comment.id),
    )
    expect(recent.map(row => row.entity_id).toSorted()).toEqual(
      comments.map(comment => comment.id).toSorted(),
    )
    const hot = await collectUntilEntities(viewer, { ...options, sort: 'hot' }, [comments[0]!.id])
    expect(hot.map(row => row.entity_id)).toEqual([comments[0]!.id])
  })
})
