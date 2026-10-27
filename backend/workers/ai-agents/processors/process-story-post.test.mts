import { createHash } from 'node:crypto'
import { it, expect, vi, beforeAll, beforeEach, describe } from 'vitest'

import type { Job } from 'glide-mq'
import * as storyPostAgent from '@agents/story-post'
import {
  createTestUserDirect,
  getPostModerationData,
  getPostSpamDetectionState,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  insertTestStory,
  setPostSpamDetectionResults,
  setTestItemStoryId,
  updatePostModerationData,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { upsertSystemUser } from '@services/users/system-users'
import { prepareStoryPost } from '@services/stories/story-posts'
import { getPostByAny } from '@services/posts/get'
import { getStoryPostSpendState, processStoryPost } from './process-story-post.mts'
import type { StoryPostJobData } from '@queues/ai-agents/types'

const callStoryPostAgentSpy = vi.spyOn(storyPostAgent, 'callStoryPostAgent')

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

let feedId: string
let urlId: string

describe('process-story-post', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
    feedId = (await createTestRssFeed({})).id
    urlId = await createTestUrlWithHostname()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function makeStoryWithItem() {
    const testUser = await createTestUserDirect()
    const story = await insertTestStory({
      title: `Story ${Math.random().toString(36).slice(2, 8)}`,
    })
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `process-story-post-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
    await setTestItemStoryId(itemId, story.id)
    const random2 = Math.random().toString(36).slice(2, 10)
    const itemData2 = { title: `Item ${random2}`, link: `https://example.com/${random2}` }
    const itemId2 = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `process-story-post-test-2-${random2}`,
      itemData: itemData2,
      contentSha256: sha256(itemData2),
    })
    await setTestItemStoryId(itemId2, story.id)
    return { story, testUser }
  }

  function makeJob(post_id: string): Job<StoryPostJobData> {
    return { data: { post_id } } as Job<StoryPostJobData>
  }

  it('processStoryPost — writes ai_summary_markdown from agent result', async () => {
    callStoryPostAgentSpy.mockResolvedValueOnce({
      title: 'Agent Title',
      ai_summary_markdown: 'Agent summary.',
    })
    const { story, testUser } = await makeStoryWithItem()
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const result = prepared.response

    await processStoryPost(makeJob(result.post.id))

    const updated = await getPostByAny(result.post.id)
    expect(updated?.ai_summary_markdown).toBe('Agent summary.')
    expect(callStoryPostAgentSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.anything(),
      undefined,
      result.post.id,
      result.post.id,
    )
  })

  it('processStoryPost — does not call agent if ai_summary_markdown already set', async () => {
    const { story, testUser } = await makeStoryWithItem()
    const prepared = await prepareStoryPost(story.id, testUser, {
      ai_summary_markdown: 'Already set.',
    })
    await prepared.finalize()
    const result = prepared.response

    callStoryPostAgentSpy.mockClear()
    await processStoryPost(makeJob(result.post.id))

    expect(callStoryPostAgentSpy).not.toHaveBeenCalled()
  })

  it('processStoryPost — preserves completed moderation for summarized stories', async () => {
    const { story, testUser } = await makeStoryWithItem()
    const prepared = await prepareStoryPost(story.id, testUser, {
      ai_summary_markdown: 'Already moderated.',
    })
    await prepared.finalize()
    const result = prepared.response
    await updatePostModerationData(
      result.post.id,
      Buffer.alloc(32, 7),
      [{ category: 'safe' }],
      false,
    )
    await setPostSpamDetectionResults(result.post.id, [
      { signal: 'story-agent-test', score: 0, flagged: false },
    ])
    const openAiBefore = (await getPostModerationData(result.post.id)) as {
      openai_omni_moderation_created_at: Date
    }
    const spamBefore = await getPostSpamDetectionState(result.post.id)

    callStoryPostAgentSpy.mockClear()
    await processStoryPost(makeJob(result.post.id))

    expect(callStoryPostAgentSpy).not.toHaveBeenCalled()
    await expect(getPostModerationData(result.post.id)).resolves.toMatchObject({
      openai_omni_moderation_created_at: openAiBefore.openai_omni_moderation_created_at,
    })
    await expect(getPostSpamDetectionState(result.post.id)).resolves.toMatchObject({
      spam_detection_created_at: spamBefore?.spam_detection_created_at,
    })
  })

  it('processStoryPost — does not overwrite post title', async () => {
    callStoryPostAgentSpy.mockResolvedValueOnce({
      title: 'Agent Title (should be ignored)',
      ai_summary_markdown: 'Summary.',
    })
    const { story, testUser } = await makeStoryWithItem()
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const result = prepared.response
    const originalTitle = result.post.title

    await processStoryPost(makeJob(result.post.id))

    const updated = await getPostByAny(result.post.id)
    expect(updated?.title).toBe(originalTitle)
  })

  it('processStoryPost — keeps the post id when a forced refresh changes the operation id', async () => {
    callStoryPostAgentSpy.mockResolvedValueOnce({
      title: 'Forced title',
      ai_summary_markdown: 'Forced summary.',
    })
    const { story, testUser } = await makeStoryWithItem()
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const result = prepared.response
    const job = {
      id: 'force-job',
      data: { post_id: result.post.id, force: true },
    } as Job<StoryPostJobData>

    await processStoryPost(job)

    expect(callStoryPostAgentSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.anything(),
      undefined,
      `${result.post.id}:force-job`,
      result.post.id,
    )
  })

  it('processStoryPost — returns null for unknown post_id', async () => {
    const result = await processStoryPost(makeJob('00000000-0000-0000-0000-000000000000'))
    expect(result).toBeNull()
  })

  it('getStoryPostSpendState — true for a fresh unsummarized story post', async () => {
    const { story, testUser } = await makeStoryWithItem()
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const result = prepared.response

    await expect(getStoryPostSpendState(result.post.id, false)).resolves.toEqual({
      postId: result.post.id,
      wouldCallModel: true,
    })
  })

  it('getStoryPostSpendState — false for a non-force retry once a summary exists', async () => {
    const { story, testUser } = await makeStoryWithItem()
    const prepared = await prepareStoryPost(story.id, testUser, {
      ai_summary_markdown: 'Already set.',
    })
    await prepared.finalize()
    const result = prepared.response

    await expect(getStoryPostSpendState(result.post.id, false)).resolves.toEqual({
      postId: result.post.id,
      wouldCallModel: false,
    })
  })

  it('getStoryPostSpendState — true for a forced retry even once a summary exists', async () => {
    const { story, testUser } = await makeStoryWithItem()
    const prepared = await prepareStoryPost(story.id, testUser, {
      ai_summary_markdown: 'Already set.',
    })
    await prepared.finalize()
    const result = prepared.response

    await expect(getStoryPostSpendState(result.post.id, true)).resolves.toEqual({
      postId: result.post.id,
      wouldCallModel: true,
    })
  })

  it('getStoryPostSpendState — null for an unknown post_id', async () => {
    await expect(
      getStoryPostSpendState('00000000-0000-0000-0000-000000000000', false),
    ).resolves.toBeNull()
  })
})
