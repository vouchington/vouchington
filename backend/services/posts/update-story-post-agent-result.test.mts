import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { moderationSignalsQueue } from '@queues/moderation-signals/queues'
import {
  countTestPostModerationAttempts,
  getTestCurrentPostModerationVersion,
} from '@voucha/test-helpers/post-moderation-attempt-state'
import { createPostModerationContent } from '@services/posts/content'
import {
  createTestUser,
  getPostModerationData,
  insertTestImage,
  insertTestPostImage,
  insertTestPost,
  updatePostTitleMarkdown,
  updatePostModerationData,
} from '@voucha/test-helpers'
import { updateStoryPostAgentResult } from './update-story-post-agent-result.mts'

describe('updateStoryPostAgentResult', () => {
  it('enqueues spam detection for the updated story moderation content hash', async () => {
    const suffix = randomUUID()
    const title = `Story agent ${suffix}`
    const aiSummaryMarkdown = `Story summary ${suffix}`
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title,
      slug: `story-agent-${suffix}`,
      createdById: creator!.id,
      markdown: '',
      postType: 'story',
      clearanceStatus: 'pending',
    })
    const { content_sha256 } = createPostModerationContent({
      title,
      markdown: '',
      ai_summary_markdown: aiSummaryMarkdown,
      images: [],
    })

    await updateStoryPostAgentResult(postId, title, aiSummaryMarkdown)

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_content_sha256: content_sha256,
      openai_omni_moderation_created_at: null,
      is_flagged_by_openai_omni_moderation: null,
      openai_omni_moderation_results: null,
    })
    await expectSpamJobForCurrentVersion(postId, content_sha256)
  })

  it('clears stale moderation state before downstream story jobs run', async () => {
    const suffix = randomUUID()
    const title = `Story stale moderation ${suffix}`
    const aiSummaryMarkdown = `Updated story summary ${suffix}`
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title,
      slug: `story-stale-moderation-${suffix}`,
      createdById: creator!.id,
      markdown: '',
      postType: 'story',
      clearanceStatus: 'pending',
    })
    await updatePostModerationData(postId, Buffer.alloc(32, 5), [{ category: 'old' }], true)

    await updateStoryPostAgentResult(postId, title, aiSummaryMarkdown)

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_created_at: null,
      is_flagged_by_openai_omni_moderation: null,
      openai_omni_moderation_results: null,
    })
  })

  it('hashes story agent results with the current locked story title', async () => {
    const suffix = randomUUID()
    const staleTitle = `Stale story title ${suffix}`
    const currentTitle = `Current story title ${suffix}`
    const aiSummaryMarkdown = `Current title summary ${suffix}`
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title: staleTitle,
      slug: `story-current-title-${suffix}`,
      createdById: creator!.id,
      markdown: '',
      postType: 'story',
      clearanceStatus: 'pending',
    })
    await updatePostTitleMarkdown(postId, currentTitle, '')
    const { content_sha256 } = createPostModerationContent({
      title: currentTitle,
      markdown: '',
      ai_summary_markdown: aiSummaryMarkdown,
      images: [],
    })

    await updateStoryPostAgentResult(postId, staleTitle, aiSummaryMarkdown)

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_content_sha256: content_sha256,
    })
    await expectSpamJobForCurrentVersion(postId, content_sha256)
  })

  it('hashes story agent results with current story images', async () => {
    const suffix = randomUUID()
    const title = `Story content hash ${suffix}`
    const aiSummaryMarkdown = `Image summary ${suffix}`
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title,
      slug: `story-body-images-${suffix}`,
      createdById: creator!.id,
      markdown: '',
      postType: 'story',
      clearanceStatus: 'pending',
    })
    const imageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId })
    const { content_sha256 } = createPostModerationContent({
      title,
      markdown: '',
      ai_summary_markdown: aiSummaryMarkdown,
      images: [{ image_id: imageId, order_index: 0, caption: '' }],
    })

    await updateStoryPostAgentResult(postId, title, aiSummaryMarkdown)

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_content_sha256: content_sha256,
    })
    await expectSpamJobForCurrentVersion(postId, content_sha256)
  })

  it('does not mutate or enqueue when the target post is not a story', async () => {
    const suffix = randomUUID()
    const title = `Non-story agent ${suffix}`
    const aiSummaryMarkdown = `Ignored summary ${suffix}`
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title,
      slug: `non-story-agent-${suffix}`,
      createdById: creator!.id,
      markdown: '',
      postType: 'discussion',
      clearanceStatus: 'pending',
    })
    const originalHash = Buffer.alloc(32, 6)
    await updatePostModerationData(postId, originalHash, [{ category: 'old' }], true)

    await updateStoryPostAgentResult(postId, title, aiSummaryMarkdown)

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_input_sha256: originalHash,
      openai_omni_moderation_created_at: expect.any(Date),
      is_flagged_by_openai_omni_moderation: true,
      openai_omni_moderation_results: { flagged_categories: [] },
    })
    expect(await countTestPostModerationAttempts(postId)).toBe(0)
  })
})

async function expectSpamJobForCurrentVersion(
  postId: string,
  contentSha256: Buffer,
): Promise<void> {
  const version = await getTestCurrentPostModerationVersion(postId)
  expect(version?.content_sha256.equals(contentSha256)).toBe(true)
  const job = await moderationSignalsQueue.getJob(`${version!.id}__spam_detection`)
  expect(job?.data).toEqual({ versionId: version!.id })
}
