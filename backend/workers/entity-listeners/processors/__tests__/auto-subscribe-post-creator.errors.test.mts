import { describe, expect, it } from 'vitest'
import { sentryCaptureExceptionMock } from '../../../../test-helpers/vitest.setup.sentry-mock.mts'
import { randomUUID } from 'node:crypto'
import { createTestUser, hardDeleteTestPost, insertTestPost } from '@voucha/test-helpers'
import { getPostByAny } from '@services/posts/get'
import { getBookmarksForEntity } from '@services/bookmarks/get'
import { autoSubscribePostCreator } from '../auto-subscribe-post-creator.mts'

describe('post creator auto-subscription failures', () => {
  it('reports a deleted-post subscription with creator context and lets the listener continue', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      createdById: creator.id,
      title: 'Deleted before auto-subscription',
      slug: `auto-subscribe-deleted-${randomUUID()}`,
      markdown: 'body',
    })
    const post = await getPostByAny(postId)
    expect(post).not.toBeNull()
    if (!post) throw new Error('Expected the owned post fixture')
    await hardDeleteTestPost(postId)

    await expect(autoSubscribePostCreator(post, creator)).resolves.toBeUndefined()

    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: '23503' }),
      {
        tags: { creatorId: creator.id, postId },
        extra: { context: 'processPostCreated.autoSubscribe' },
      },
    )
    expect(await getBookmarksForEntity(creator, 'post', { id: postId })).toEqual({})
  })
})
