import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createEntityRelationWithElection,
  createTestUser,
  createTestUrlWithHostname,
  createTestRedirectUrl,
  insertTestPost,
  insertTestPostStory,
  insertTestStory,
  readAllQueueJobs,
  setPostLLMModerationContentSha256,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { crawlUrls } from '@queues/crawler/queues'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { postMentions } from '@queues/post-mentions/queues'
import { spam_detection } from '@queues/spam-detection/queues'
import '@services/referral-program-link-validations'
import { createPostModerationContent } from '@services/posts/content'
import { createPost, getPostByAny } from '@services/posts'
import type { Post } from '@services/posts/types'
import { getUrlByAny } from '@services/urls/get'
import { processPostCreated, processPostUpdated } from '../posts.mts'
import { recoverPostCreatedEffects } from '../post-created-recovery.mts'

describe('post entity listener creation dispatch', () => {
  it('skips spam detection for approved posts', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title: `Approved listener post ${randomUUID()}`,
      slug: `approved-listener-post-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Approved post body',
      clearanceStatus: 'approved',
    })

    await processPostCreated({ id: postId })

    const spamJobs = await spam_detection.getJobs('waiting')
    expect(spamJobs.some(job => (job.data as { id?: string }).id === postId)).toBe(false)
  })

  it('completes core dispatch before propagating a recovery failure for retry', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `Recovery failure ${randomUUID()}`,
      slug: `recovery-failure-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'Core post-created work must still run.',
      clearanceStatus: 'approved',
    })
    const recoveryError = new Error('recovery unavailable')
    const recoverPostCreatedEffects = vi.fn<(post: { id: string }) => Promise<void>>(async () => {
      const mentionJobs = await postMentions.getJobs('waiting')
      expect(mentionJobs.some(job => (job.data as { postId?: string }).postId === postId)).toBe(
        true,
      )
      throw recoveryError
    })

    await expect(processPostCreated({ id: postId }, { recoverPostCreatedEffects })).rejects.toBe(
      recoveryError,
    )

    expect(recoverPostCreatedEffects).toHaveBeenCalledWith(expect.objectContaining({ id: postId }))
  })

  it('enqueues spam detection for pending user posts', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title: `Pending listener post ${randomUUID()}`,
      slug: `pending-listener-post-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Pending post body',
      clearanceStatus: 'pending',
    })

    await processPostCreated({ id: postId })

    const post = (await getPostByAny(postId)) as Post
    const { content_sha256 } = createPostModerationContent(post)
    const spamJobs = await spam_detection.getJobs('waiting')
    const spamJob = spamJobs.find(
      job => job.name === 'post' && (job.data as { id?: string }).id === postId,
    )
    expect(spamJob).toBeDefined()
    expect(spamJob!.data).toMatchObject({
      id: postId,
      contentSha256: content_sha256.toString('hex'),
    })
  })

  it('recovers canonical and immutable source URL effects after the source relation is removed', async () => {
    try {
      await crawlUrls.obliterate()
      const creator = await createTestUser()
      const canonicalUrlId = await createTestUrlWithHostname()
      const { urlString: sourceUrl } = await createTestRedirectUrl({ canonicalUrlId })
      const sourceUrlId = (await getUrlByAny(sourceUrl))!.id
      const post = await createPost(WEB_PROVENANCE, creator, {
        title: `Redirect recovery ${randomUUID()}`,
        markdown: 'Link post recovery body',
        post_type: 'link',
        url: sourceUrl,
      })
      const postRelatedUrl = getEntityRelationMetadataOrThrow({
        subjectType: 'post',
        objectType: 'url',
        predicate: 'related',
      })
      await softDeleteEntityRelation(creator, postRelatedUrl, post, [{ id: sourceUrlId }])
      await crawlUrls.obliterate()

      await processPostCreated({ id: post.id })

      const jobs = await readAllQueueJobs(crawlUrls)
      const recoveredUrlIds = new Set(
        jobs.map(job => (job.data as { url_id?: string }).url_id).filter(Boolean),
      )
      expect(recoveredUrlIds.has(canonicalUrlId)).toBe(true)
      expect(recoveredUrlIds.has(sourceUrlId)).toBe(true)
    } finally {
      await crawlUrls.obliterate()
    }
  })

  it('uses the prior elected relation only for legacy rows without immutable provenance', async () => {
    try {
      await crawlUrls.obliterate()
      const creator = await createTestUser()
      const canonicalUrlId = await createTestUrlWithHostname()
      const { urlString: sourceUrl } = await createTestRedirectUrl({ canonicalUrlId })
      const sourceUrlId = (await getUrlByAny(sourceUrl))!.id
      const postId = await insertTestPost({
        title: `Legacy redirect recovery ${randomUUID()}`,
        slug: `legacy-redirect-recovery-${randomUUID()}`,
        createdById: creator.id,
        markdown: 'Legacy link post recovery body',
        postType: 'link',
        urlId: canonicalUrlId,
      })
      await createEntityRelationWithElection(postId, sourceUrlId, creator.id, 1)

      await processPostCreated({ id: postId })

      const jobs = await readAllQueueJobs(crawlUrls)
      const recoveredUrlIds = new Set(
        jobs.map(job => (job.data as { url_id?: string }).url_id).filter(Boolean),
      )
      expect(recoveredUrlIds.has(canonicalUrlId)).toBe(true)
      expect(recoveredUrlIds.has(sourceUrlId)).toBe(true)
    } finally {
      await crawlUrls.obliterate()
    }
  })

  it('recovers the canonical URL for an old-writer link without a persisted raw source', async () => {
    try {
      await crawlUrls.obliterate()
      const creator = await createTestUser()
      const urlId = await createTestUrlWithHostname()
      const postId = await insertTestPost({
        title: `Pre-existing URL recovery ${randomUUID()}`,
        slug: `pre-existing-url-recovery-${randomUUID()}`,
        createdById: creator.id,
        markdown: 'Stored link post recovery body',
        postType: 'link',
        urlId,
      })

      await processPostCreated({ id: postId })

      const jobs = await readAllQueueJobs(crawlUrls)
      expect(jobs.some(job => (job.data as { url_id?: string }).url_id === urlId)).toBe(true)
    } finally {
      await crawlUrls.obliterate()
    }
  })

  it('idempotently recovers crawl work for a pre-resolved link URL', async () => {
    try {
      await crawlUrls.obliterate()
      const creator = await createTestUser()
      const urlId = await createTestUrlWithHostname()
      const post = await createPost(WEB_PROVENANCE, creator, { post_type: 'link', url_id: urlId })
      await crawlUrls.obliterate()

      await processPostCreated({ id: post.id })

      const jobs = await readAllQueueJobs(crawlUrls)
      expect(jobs.some(job => (job.data as { url_id?: string }).url_id === urlId)).toBe(true)
    } finally {
      await crawlUrls.obliterate()
    }
  })

  it('propagates a recovered story-agent enqueue failure for retry', async () => {
    const creator = await createTestUser()
    const story = await insertTestStory({ title: randomUUID() })
    const postId = await insertTestPost({
      title: randomUUID(),
      slug: randomUUID(),
      createdById: creator.id,
      markdown: 'Story recovery body.',
      clearanceStatus: 'approved',
    })
    await insertTestPostStory(postId, story.id, creator.id)
    const enqueueError = new Error('story-agent queue unavailable')
    const enqueueStoryPostAgent = vi
      .fn<(postId: string) => Promise<void>>()
      .mockRejectedValue(enqueueError)

    await expect(
      recoverPostCreatedEffects({ id: postId, post_type: 'story' }, { enqueueStoryPostAgent }),
    ).rejects.toBe(enqueueError)
    expect(enqueueStoryPostAgent).toHaveBeenCalledWith(postId)
  })

  it('enqueues content-hash-specific spam detection when post content changes', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title: `Updated listener post ${randomUUID()}`,
      slug: `updated-listener-post-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Updated post body',
      clearanceStatus: 'pending',
    })
    const post = (await getPostByAny(postId)) as Post
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(postId, content_sha256)

    await processPostUpdated({ id: postId, contentChanged: true })

    const spamJobs = await spam_detection.getJobs('waiting')
    const spamJob = spamJobs.find(
      job => job.name === 'post' && (job.data as { id?: string }).id === postId,
    )
    expect(spamJob).toBeDefined()
    expect(spamJob!.data).toMatchObject({
      id: postId,
      contentSha256: content_sha256.toString('hex'),
    })
  })
})
