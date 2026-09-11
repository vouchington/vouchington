import { it, expect, beforeAll, describe } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { getBookmarksForEntity } from '@services/bookmarks/get'
import { getPostElectionVote } from '@services/elections-votes/post'
import { getPostByAny } from '@services/posts/get'
import { processPostCreated } from '../posts.mts'
import type { PrivateUser } from '@services/users/types'

describe('posts.creator-upvote.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('post creator upvotes and auto-subscribes to their own post on creation', async () => {
    const postId = await insertTestPost({
      title: 'Test Post',
      slug: `test-post-${Date.now()}`,
      createdById: user.id,
      markdown: 'Test post content',
    })
    await processPostCreated({ id: postId })

    const post = await getPostByAny(postId)

    const vote = await getPostElectionVote(user.id, post!.id)
    expect(vote).toBeDefined()
    expect(vote!.choice).toBe('like')

    const bookmarks = await getBookmarksForEntity(user, 'post', { id: postId })
    expect(bookmarks.subscribe).toBe(true)
  })
})
