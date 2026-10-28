import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import {
  createTestUser,
  expireTestPostModerationVersion,
  getPostClearanceStatus,
  getPostModerationData,
  insertPendingTestImage,
  insertTestImage,
  insertTestPost,
  readAllQueueJobs,
  setImageOpenAIModerationResults,
  setPostModerationContentSha256,
  updateImageStatus,
  updatePostModerationData,
} from '@voucha/test-helpers'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { notifications } from '@queues/notifications/queues'
import { background } from '@queues/background/queues'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import {
  beginPostModerationAttempt,
  ensureCurrentPostModerationVersion,
} from '@services/post-clearance'
import {
  getTestPostModerationAttemptStateForPost,
  getTestPostModerationVersionOwners,
} from '@voucha/test-helpers/post-moderation-attempt-state'
import { postClearanceWorkConfig } from '@services/post-clearance/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { handleOpenAIModerationOmniSingleJob } from '../../processors/openai-moderation-omni-single.mts'

describe('openai moderation single worker', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('exits when the current version already has an OpenAI disposition', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const title = `OpenAI current moderation worker ${randomUUID()}`
    const markdown = 'Already moderated worker body.'
    const postId = await insertTestPost({
      title,
      slug: `openai-no-content-worker-${randomUUID()}`,
      createdById: creator!.id,
      markdown,
      clearanceStatus: 'pending',
    })
    const { content_sha256 } = createPostModerationContent({ title, markdown })
    await setPostModerationContentSha256(postId, content_sha256)
    await updatePostModerationData(postId, content_sha256, [{ flagged: false }], false)
    const version = await ensureCurrentPostModerationVersion(postId)

    await expect(handleOpenAIModerationOmniSingleJob(makePostJob(version.id))).resolves.toEqual({
      success: true,
      applied: false,
    })

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_created_at: expect.any(Date),
      is_flagged_by_openai_omni_moderation: false,
    })

    const notificationJobs = await readAllQueueJobs(notifications)
    expect(
      notificationJobs.some(
        job =>
          job.name === 'notifications.processReconcilePostNotifications' &&
          (job.data as { postId?: string }).postId === postId,
      ),
    ).toBe(false)
  })

  it('exits when the version no longer exists', async () => {
    await expect(handleOpenAIModerationOmniSingleJob(makePostJob(randomUUID()))).resolves.toEqual({
      success: true,
      applied: false,
    })
  })

  it('returns current image moderation state for already-moderated images', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const imageId = await insertTestImage(creator!.id)
    await setImageOpenAIModerationResults(imageId, [{ flagged: false }], false)

    await expect(
      handleOpenAIModerationOmniSingleJob(makeJob('image', imageId)),
    ).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: 'already_moderated',
    })
  })

  it('enqueues real post and image moderation backfills', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title: `OpenAI backfill worker ${randomUUID()}`,
      slug: `openai-backfill-worker-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Backfill worker body.',
      clearanceStatus: 'pending',
    })
    const imageId = await insertPendingTestImage(creator!.id)
    await updateImageStatus(imageId, 'complete')

    // Start just before these rows so older unmoderated rows still enqueue on the first page.
    const postResult = (await handleOpenAIModerationOmniSingleJob(
      makeBackfillJob('backfill_posts', uuidBefore(postId)),
    )) as { enqueued: number }
    const imageResult = (await handleOpenAIModerationOmniSingleJob(
      makeBackfillJob('backfill_images', uuidBefore(imageId)),
    )) as { enqueued: number }

    expect(postResult.enqueued).toBeGreaterThanOrEqual(1)
    expect(imageResult.enqueued).toBeGreaterThanOrEqual(1)

    const waitingJobs = await readAllQueueJobs(background)
    const postVersionIds = waitingJobs
      .filter(job => job.name === 'openai-moderation.post')
      .map(job => (job.data as { versionId?: string }).versionId)
      .filter((versionId): versionId is string => typeof versionId === 'string')
    const owners = await getTestPostModerationVersionOwners(postVersionIds)
    expect(owners.some(owner => owner.post_id === postId)).toBe(true)
    expect(
      waitingJobs.some(
        job =>
          job.name === 'openai-moderation.image' && (job.data as { id?: string }).id === imageId,
      ),
    ).toBe(true)
  })

  it('requeues due source work and moves deadline-exhausted posts to review', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const duePostId = await insertTestPost({
      title: `OpenAI reconcile due ${randomUUID()}`,
      slug: `openai-reconcile-due-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Reconciliation due work.',
      clearanceStatus: 'pending',
    })
    const expiredPostId = await insertTestPost({
      title: `OpenAI reconcile expired ${randomUUID()}`,
      slug: `openai-reconcile-expired-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Reconciliation expired work.',
      clearanceStatus: 'pending',
    })
    const foreignPostId = await insertTestPost({
      title: `OpenAI reconcile foreign ${randomUUID()}`,
      slug: `openai-reconcile-foreign-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Foreign reconciliation work stays pending.',
      clearanceStatus: 'pending',
    })
    const dueVersion = await ensureCurrentPostModerationVersion(duePostId)
    const expiredVersion = await ensureCurrentPostModerationVersion(expiredPostId)
    await expireTestPostModerationVersion(expiredVersion.id)
    const foreignVersion = await ensureCurrentPostModerationVersion(foreignPostId)
    await expireTestPostModerationVersion(foreignVersion.id)

    const result = (await handleOpenAIModerationOmniSingleJob(
      makeJob('reconcile_post_moderation', randomUUID()),
      { postIds: [duePostId, expiredPostId] },
    )) as { enqueued: number; moved_to_review: number }

    expect(result.enqueued).toBe(2)
    expect(result.moved_to_review).toBe(1)
    await expect(getPostClearanceStatus(expiredPostId)).resolves.toBe('in_review')
    await expect(getPostClearanceStatus(foreignPostId)).resolves.toBe('pending')

    const openaiJobs = await readAllQueueJobs(background)
    expect(openaiJobs.some(job => job.id === `${dueVersion.id}__openai_omni`)).toBe(true)
    expect(openaiJobs.some(job => job.id === `${foreignVersion.id}__openai_omni`)).toBe(false)
  })

  it('keeps a scoped reconciliation confined to its posts on continuation pages', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postClearanceWorkConfig, {
        reconciliation_batch_size: 1,
      }),
    )
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const scopedPostId = await insertTestPost({
      title: `OpenAI scoped reconciliation ${randomUUID()}`,
      slug: `openai-scoped-reconciliation-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Scoped reconciliation work.',
      clearanceStatus: 'pending',
    })
    const foreignPostId = await insertTestPost({
      title: `OpenAI foreign reconciliation ${randomUUID()}`,
      slug: `openai-foreign-reconciliation-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Foreign reconciliation work.',
      clearanceStatus: 'pending',
    })
    await ensureCurrentPostModerationVersion(scopedPostId)
    const foreignVersion = await ensureCurrentPostModerationVersion(foreignPostId)
    await expireTestPostModerationVersion(foreignVersion.id)

    const first = (await handleOpenAIModerationOmniSingleJob(
      makeJob('reconcile_post_moderation', randomUUID()),
      { postIds: [scopedPostId] },
    )) as { hasMore: boolean }
    expect(first.hasMore).toBe(true)
    const continuation = (await readAllQueueJobs(background)).find(
      job =>
        job.name === 'openai-moderation.reconcile_post_moderation' &&
        (job.data as { postIds?: string[] }).postIds?.[0] === scopedPostId,
    )
    expect(continuation).toBeDefined()
    const second = (await handleOpenAIModerationOmniSingleJob(
      continuation as Job<{ postIds: string[] }>,
    )) as { hasMore: boolean }
    expect(second.hasMore).toBe(false)
    await expect(getPostClearanceStatus(foreignPostId)).resolves.toBe('pending')
  })

  it('records a retryable failed attempt when the provider is unavailable', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title: `OpenAI provider unavailable ${randomUUID()}`,
      slug: `openai-provider-unavailable-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Provider unavailable worker fixture.',
      clearanceStatus: 'pending',
    })
    const post = await getPostByAny(postId)
    if (!post) throw new Error('missing provider fixture')
    await setPostModerationContentSha256(postId, createPostModerationContent(post).content_sha256)
    const attempt = await beginPostModerationAttempt(postId, 'openai_omni')
    vi.stubEnv('OPENAI_API_KEY', '')

    await expect(
      handleOpenAIModerationOmniSingleJob(makePostJob(attempt!.version_id)),
    ).rejects.toThrow('OPENAI_API_KEY is not set')
    await expect(getTestPostModerationAttemptStateForPost(postId, 'openai_omni')).resolves.toEqual({
      completed_at: null,
      attempt_number: 1,
    })
    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      is_flagged_by_openai_omni_moderation: null,
    })
  })

  it('rejects malformed and unknown jobs through the retry handler', async () => {
    const malformedPost = { data: {}, name: 'openai-moderation.post' } as Job<{ versionId: string }>
    const malformedImage = { data: {}, name: 'openai-moderation.image' } as Job<{ id: string }>
    await expect(handleOpenAIModerationOmniSingleJob(malformedPost)).rejects.toThrow(
      'Post job requires versionId in job.data',
    )
    await expect(handleOpenAIModerationOmniSingleJob(malformedImage)).rejects.toThrow(
      'Image job requires id in job.data',
    )
    await expect(
      handleOpenAIModerationOmniSingleJob(makeJob('unexpected', randomUUID())),
    ).rejects.toThrow('Unknown job type: openai-moderation.unexpected')
  })
})

function makeBackfillJob(name: string, afterId: string): Job<{ afterId: string }> {
  return { data: { afterId }, name: `openai-moderation.${name}` } as Job<{ afterId: string }>
}

function makePostJob(versionId: string): Job<{ versionId: string }> {
  return { data: { versionId }, name: 'openai-moderation.post' } as Job<{ versionId: string }>
}

function makeJob(name: string, id: string): Job<{ id: string }> {
  return { data: { id }, name: `openai-moderation.${name}` } as Job<{ id: string }>
}
