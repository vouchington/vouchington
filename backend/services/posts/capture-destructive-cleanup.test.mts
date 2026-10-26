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
import { postPublicationEffectJobId } from '../../queues/post-publication/enqueues.mts'
import { postPublicationQueue } from '../../queues/post-publication/queues.mts'
import {
  capturedPublicationKeys,
  hashCapturedPublicationKeys,
} from '@services/post-publication/captured-keys'
import { recordPostPublicationChange } from '@services/post-publication/capture'
import { retainHardDeletedPostPublication } from '@services/post-publication/capture-hard-delete'
import type { PostPublicationChange } from '@services/post-publication/types'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { describe, expect, it, onTestFinished } from 'vitest'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'

describe('destructive publication capture', () => {
  it('captures every descendant identity before deletion without a projection receipt', async () => {
    const user = await createTestUser()
    const suffix = createRandomString(8)
    const rootId = await insertTestPost({
      title: `Physical delete root ${suffix}`,
      slug: `physical-delete-root-${suffix}`,
      markdown: 'Root',
      createdById: user.id,
    })
    onTestFinished(() => hardDeleteTestPost(rootId))
    const childId = await insertTestPost({
      title: `Physical delete child ${suffix}`,
      slug: `physical-delete-child-${suffix}`,
      markdown: 'Child',
      postType: 'comment',
      createdById: user.id,
      rootId,
      parentId: rootId,
    })
    const grandchildSlug = `physical-delete-grandchild-${suffix}`
    const grandchildId = await insertTestPost({
      title: `Physical delete grandchild ${suffix}`,
      slug: grandchildSlug,
      markdown: 'Grandchild',
      postType: 'comment',
      createdById: user.id,
      rootId,
      parentId: childId,
    })
    const jobs = await captureAddedPublicationEffectsForScope(childId, async () => {
      await using query = await beginTransaction()
      await retainHardDeletedPostPublication(query, [childId])
      await deleteTestPostRow(query, childId)
      await query.commit()
    })
    expect(jobs.flatMap(job => job.keys)).toEqual(
      expect.arrayContaining([
        { kind: 'impact_post', uuidValue: childId },
        { kind: 'impact_post', uuidValue: grandchildId },
        { kind: 'identity_post_slug', textValue: grandchildSlug },
        { kind: 'identity_author', uuidValue: user.id },
      ]),
    )
  })

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

    const keys = capturedPublicationKeys(change)
    const jobId = postPublicationEffectJobId({
      changeId,
      postId: commentId,
      scope: { type: 'post', id: commentId },
      reason: change.reason,
      keys,
      keyHash: hashCapturedPublicationKeys(keys),
      chunkIndex: 0,
    })
    onTestFinished(async () => (await postPublicationQueue.getJob(jobId))?.remove())
    const job = await postPublicationQueue.getJob(jobId)
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
