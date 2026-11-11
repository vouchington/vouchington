import {
  beginTransaction,
  createRandomString,
  createTestUser,
  hardDeleteTestPost,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  deleteTestPostRow,
  listExistingTestPostIds,
} from '../../test-helpers/publication-test-queries.mts'
import { backgroundQueue as postPublicationQueue } from '@voucha/test-helpers/shared-background-queue'
import { recordPostPublicationChange } from '@services/post-publication/capture'
import type { PostPublicationChange } from '@services/post-publication/types'
import { describe, expect, it, onTestFinished } from 'vitest'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'

describe('destructive publication capture', () => {
  it('captures a reply and its old slug before a mid-thread hard delete cascades', async () => {
    const user = await createTestUser()
    const suffix = createRandomString(8)
    const rootId = await insertTestPost({
      title: `Hard delete root ${suffix}`,
      slug: `hard-delete-root-${suffix}`,
      markdown: 'Root',
      createdById: user.id,
    })
    onTestFinished(() => hardDeleteTestPost(rootId))
    const commentId = await insertTestPost({
      title: `Hard delete comment ${suffix}`,
      slug: `hard-delete-comment-${suffix}`,
      markdown: 'Comment',
      postType: 'comment',
      createdById: user.id,
      rootId,
      parentId: rootId,
    })
    const replySlug = `hard-delete-reply-${suffix}`
    const replyId = await insertTestPost({
      title: `Hard delete reply ${suffix}`,
      slug: replySlug,
      markdown: 'Reply',
      postType: 'comment',
      createdById: user.id,
      rootId,
      parentId: commentId,
    })
    const change: PostPublicationChange = {
      scope: { type: 'post', postId: commentId },
      reason: 'post_deleted',
      impactedPostIds: [commentId, replyId],
      footprint: { priorRootId: rootId, priorPostSlug: replySlug },
    }
    await using query = await beginTransaction()
    const changeId = await recordPostPublicationChange(query, change)
    await deleteTestPostRow(query, commentId)
    await query.commit()

    const [job] = await postPublicationQueue.searchJobs({
      name: 'post-publication.apply-effects',
      data: { changeId },
    })
    if (!job) throw new Error('Expected captured destructive-cleanup effect')
    onTestFinished(async () => job.remove())
    expect((job?.data as PostPublicationEffectsJobData | undefined)?.keys).toEqual(
      expect.arrayContaining([
        { kind: 'impact_post', uuidValue: commentId },
        { kind: 'impact_post', uuidValue: replyId },
        { kind: 'identity_post_slug', textValue: replySlug },
      ]),
    )
    expect(await listExistingTestPostIds([rootId, commentId, replyId])).toEqual([rootId])
  })
})
