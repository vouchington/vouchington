import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { spam_detection } from '@queues/spam-detection/queues'
import { createPostModerationContent } from '@services/posts/content'
import {
  createTestUser,
  getPostModerationData,
  insertTestImage,
  insertTestPostImage,
  insertTestPost,
  updatePostTitleMarkdown,
  updatePostModerationData,
  getTestPostPublicationDirtyWorkForScope,
} from '@voucha/test-helpers'
import { updateStoryPostAgentResult } from './update-story-post-agent-result.mts'

describe('updateStoryPostAgentResult', () => {
  beforeEach(async () => {
    await spam_detection.obliterate({ force: true })
  })

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
      openai_omni_moderation_flagged: null,
      openai_omni_moderation_results: null,
    })
    const waiting = await spam_detection.getJobs('waiting')
    const spamJob = waiting.find(job => (job.data as { id?: string }).id === postId)
    expect(spamJob).toBeDefined()
    expect(spamJob!.data).toMatchObject({
      id: postId,
      contentSha256: content_sha256.toString('hex'),
    })
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
      openai_omni_moderation_flagged: null,
      openai_omni_moderation_results: null,
    })
  })

  it('records durable publication work for the asynchronous story summary update', async () => {
    const suffix = randomUUID()
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `Story publication ${suffix}`,
      slug: `story-publication-${suffix}`,
      createdById: creator.id,
      markdown: '',
      postType: 'story',
      clearanceStatus: 'pending',
    })

    await updateStoryPostAgentResult(postId, `Story publication ${suffix}`, `Summary ${suffix}`)

    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toMatchObject({ post_id: postId, reasons: ['post_content_reset'] })
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
    const waiting = await spam_detection.getJobs('waiting')
    const spamJob = waiting.find(job => (job.data as { id?: string }).id === postId)
    expect(spamJob!.data).toMatchObject({
      contentSha256: content_sha256.toString('hex'),
    })
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
    const waiting = await spam_detection.getJobs('waiting')
    const spamJob = waiting.find(job => (job.data as { id?: string }).id === postId)
    expect(spamJob!.data).toMatchObject({
      contentSha256: content_sha256.toString('hex'),
    })
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
      openai_omni_moderation_flagged: true,
      openai_omni_moderation_results: [{ category: 'old' }],
    })
    const waiting = await spam_detection.getJobs('waiting')
    expect(waiting).toHaveLength(0)
  })
})
