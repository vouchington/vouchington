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
import { backgroundCpu as crawlUrls } from '@queues/background-cpu/queues'
import { createEntityRelationCrawlObserver } from '@voucha/test-helpers/entity-relation-crawl-observer'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { POST_MENTIONS_PROCESS_JOB } from '@queues/background/enqueues/post-mentions-jobs'
import { postMentionsQueue } from '@queues/post-mentions/queues'
import { moderationSignalsQueue } from '@queues/moderation-signals/queues'
import {
  countTestPostModerationAttempts,
  getTestCurrentPostModerationVersion,
} from '@voucha/test-helpers/post-moderation-attempt-state'
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

    expect(await countTestPostModerationAttempts(postId)).toBe(0)
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
      const mentionJobs = await readAllQueueJobs(postMentionsQueue)
      expect(
        mentionJobs.some(
          job =>
            job.name === POST_MENTIONS_PROCESS_JOB.name &&
            (job.data as { postId?: string }).postId === postId,
        ),
      ).toBe(true)
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

    const version = await getTestCurrentPostModerationVersion(postId)
    expect(version).not.toBeNull()
    await expect(
      moderationSignalsQueue.getJob(`${version!.id}__spam_detection`),
    ).resolves.toMatchObject({ data: { versionId: version!.id } })
  })

  it('recovers canonical and immutable source URL effects after the source relation is removed', async () => {
    const creator = await createTestUser()
    const canonicalUrlId = await createTestUrlWithHostname()
    const { urlString: sourceUrl } = await createTestRedirectUrl({ canonicalUrlId })
    const sourceUrlId = (await getUrlByAny(sourceUrl))!.id
    await using observer = createEntityRelationCrawlObserver(new Set([canonicalUrlId, sourceUrlId]))
    const post = await createPost(creator, WEB_PROVENANCE, {
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
    await Promise.all(observer.ownedPromises())
    await removeCrawlJobs([canonicalUrlId, sourceUrlId])

    await processPostCreated({ id: post.id })

    const recoveredUrlIds = new Set(
      (await crawlJobs([canonicalUrlId, sourceUrlId])).map(
        job => (job.data as { url_id?: string }).url_id,
      ),
    )
    expect(recoveredUrlIds.has(canonicalUrlId)).toBe(true)
    expect(recoveredUrlIds.has(sourceUrlId)).toBe(true)
  })

  it('ignores an elected relation when immutable source provenance is absent', async () => {
    const creator = await createTestUser()
    const canonicalUrlId = await createTestUrlWithHostname()
    const { urlString: sourceUrl } = await createTestRedirectUrl({ canonicalUrlId })
    const sourceUrlId = (await getUrlByAny(sourceUrl))!.id
    await using observer = createEntityRelationCrawlObserver(new Set([canonicalUrlId, sourceUrlId]))
    const postId = await insertTestPost({
      title: `Relation-only redirect recovery ${randomUUID()}`,
      slug: `relation-only-redirect-recovery-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'Relation-only link post recovery body',
      postType: 'link',
      urlId: canonicalUrlId,
    })
    await createEntityRelationWithElection(postId, sourceUrlId, creator.id, 1)

    await processPostCreated({ id: postId })
    await Promise.all(observer.ownedPromises())

    const recoveredUrlIds = new Set(
      (await crawlJobs([canonicalUrlId, sourceUrlId])).map(
        job => (job.data as { url_id?: string }).url_id,
      ),
    )
    expect(recoveredUrlIds.has(canonicalUrlId)).toBe(true)
    expect(recoveredUrlIds.has(sourceUrlId)).toBe(false)
  })

  it('recovers the canonical URL for a link without a raw source', async () => {
    const creator = await createTestUser()
    const urlId = await createTestUrlWithHostname()
    await using observer = createEntityRelationCrawlObserver(new Set([urlId]))
    const postId = await insertTestPost({
      title: `Pre-existing URL recovery ${randomUUID()}`,
      slug: `pre-existing-url-recovery-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'Stored link post recovery body',
      postType: 'link',
      urlId,
    })

    await processPostCreated({ id: postId })
    await Promise.all(observer.ownedPromises())

    expect(
      (await crawlJobs([urlId])).some(job => (job.data as { url_id?: string }).url_id === urlId),
    ).toBe(true)
  })

  it('idempotently recovers crawl work for a pre-resolved link URL', async () => {
    const creator = await createTestUser()
    const urlId = await createTestUrlWithHostname()
    await using observer = createEntityRelationCrawlObserver(new Set([urlId]))
    const post = await createPost(creator, WEB_PROVENANCE, { post_type: 'link', url_id: urlId })
    await Promise.all(observer.ownedPromises())
    await removeCrawlJobs([urlId])

    await processPostCreated({ id: post.id })

    expect(
      (await crawlJobs([urlId])).some(job => (job.data as { url_id?: string }).url_id === urlId),
    ).toBe(true)
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

    await expectCurrentSpamJob(postId, content_sha256)
  })
})

async function expectCurrentSpamJob(postId: string, contentSha256: Buffer): Promise<void> {
  const version = await getTestCurrentPostModerationVersion(postId)
  expect(version?.content_sha256.equals(contentSha256)).toBe(true)
  const job = await moderationSignalsQueue.getJob(`${version!.id}__spam_detection`)
  expect(job?.data).toEqual({ versionId: version!.id })
}

async function crawlJobs(urlIds: string[]) {
  return Promise.all(
    urlIds.map(url_id => crawlUrls.searchJobs({ name: 'crawl.crawl_url', data: { url_id } })),
  ).then(results => results.flat())
}

async function removeCrawlJobs(urlIds: string[]): Promise<void> {
  const jobs = await crawlJobs(urlIds)
  await Promise.all(jobs.map(job => job.remove()))
}
