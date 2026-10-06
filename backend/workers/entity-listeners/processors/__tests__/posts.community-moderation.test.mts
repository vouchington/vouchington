import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
  setPostLLMModerationContentSha256,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { readClassifierRunDispatcherJobsForTest } from '@voucha/test-helpers/classifier-run-queue-jobs'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import { setPostClearanceStatus } from '@services/post-clearance/update-status'
import type { Post } from '@services/posts/types'
import { processPostUpdated } from '../posts.mts'
import { recoverPostCreatedEffects } from '../post-created-recovery.mts'

async function readCommunityModerationDispatchers(postId: string) {
  const jobs = await readClassifierRunDispatcherJobsForTest(postId)
  return jobs.filter(
    job =>
      (job.data as { classifier?: string }).classifier === COMMUNITY_MODERATION_CLASSIFIER_SLUG,
  )
}

async function createPublishedPost(createdById: string) {
  const postId = await insertTestPost({
    title: `Community moderation post ${randomUUID()}`,
    slug: `community-moderation-post-${randomUUID()}`,
    createdById,
    markdown: 'Community moderation post body',
    clearanceStatus: 'approved',
  })
  const community = await insertTestCommunity({ createdById })
  await insertTestCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: createdById,
  })
  return { postId, communityId: community.id }
}

describe('post entity listener community moderation request', () => {
  it('requests the C8 run at the edited content and queues one dispatcher when content changes', async () => {
    const creator = await createTestUser()
    const { postId } = await createPublishedPost(creator.id)
    const post = (await getPostByAny(postId)) as Post
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(postId, content_sha256)

    await processPostUpdated({ id: postId, contentChanged: true })

    expect(
      await getClassifierRunRequestFacts(postId, COMMUNITY_MODERATION_CLASSIFIER_SLUG),
    ).toMatchObject([{ input_sha256: content_sha256, run_id: null, stale_at: null }])
    expect(await readCommunityModerationDispatchers(postId)).toHaveLength(1)
  })

  it('requests nothing for a post that is no longer published in its community', async () => {
    const creator = await createTestUser()
    const { postId, communityId } = await createPublishedPost(creator.id)
    await updateTestCommunityPostReviewState({ communityId, postId, unpublishedAt: new Date() })

    await recoverPostCreatedEffects({ id: postId, post_type: 'discussion' })

    expect(
      await getClassifierRunRequestFacts(postId, COMMUNITY_MODERATION_CLASSIFIER_SLUG),
    ).toEqual([])
    expect(await readCommunityModerationDispatchers(postId)).toEqual([])
  })

  it('skips moderation for an explicit administrator creation', async () => {
    const administrator = await createTestUser({ administrator: true })
    const postId = await insertTestPost({
      title: `Explicit administrator creation ${randomUUID()}`,
      slug: `administrator-creation-${randomUUID()}`,
      createdById: administrator.id,
      markdown: 'Trusted administrator community post.',
      clearanceStatus: 'pending',
    })
    await setPostClearanceStatus(
      postId,
      'approved',
      administrator.id,
      undefined,
      {},
      {
        isCreationModerationBypass: true,
      },
    )
    const community = await insertTestCommunity({ createdById: administrator.id })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: administrator.id,
    })

    await recoverPostCreatedEffects({ id: postId, post_type: 'discussion' })

    expect(
      await getClassifierRunRequestFacts(postId, COMMUNITY_MODERATION_CLASSIFIER_SLUG),
    ).toEqual([])
    expect(await readCommunityModerationDispatchers(postId)).toEqual([])
  })

  it('recovers the request of a published post once, however often creation is replayed', async () => {
    const creator = await createTestUser()
    const { postId } = await createPublishedPost(creator.id)

    await recoverPostCreatedEffects({ id: postId, post_type: 'discussion' })
    await recoverPostCreatedEffects({ id: postId, post_type: 'discussion' })

    expect(
      await getClassifierRunRequestFacts(postId, COMMUNITY_MODERATION_CLASSIFIER_SLUG),
    ).toHaveLength(1)
    expect(await readCommunityModerationDispatchers(postId)).toHaveLength(1)
  })
})
