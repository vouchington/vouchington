import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import {
  createTestUser,
  expireTestPostModerationVersion,
  getPostClearanceStatus,
  getPostModerationData,
  getTestPostModerationRetryDelayMinutes,
  insertPendingTestImage,
  insertTestImage,
  insertTestPost,
  readAllQueueJobs,
  setImageOpenAIModerationResults,
  setPostModerationContentSha256,
  updateImageStatus,
  updatePostModerationData,
} from '@voucha/test-helpers'
import { notifications } from '@queues/notifications/queues'
import { openai_moderation_omni_single } from '@queues/openai-moderation/queues'
import { createPostModerationContent } from '@services/posts/content'
import { ensureCurrentPostModerationVersion } from '@services/post-clearance'
import { handleOpenAIModerationOmniSingleJob } from '../../processors/openai-moderation-omni-single.mts'

describe('openai moderation single worker', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses current persisted moderation and enqueues notification reconciliation without calling OpenAI', async () => {
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

    await expect(
      handleOpenAIModerationOmniSingleJob(makeJob('post', postId), {} as Worker),
    ).resolves.toEqual({ success: true })

    const moderation = (await getPostModerationData(postId)) as {
      openai_omni_moderation_created_at: Date | null
      openai_omni_moderation_flagged: boolean | null
    }
    expect(moderation.openai_omni_moderation_created_at).toBeInstanceOf(Date)
    expect(moderation.openai_omni_moderation_flagged).toBe(false)

    const notificationJobs = await notifications.getJobs('waiting')
    expect(
      notificationJobs.some(
        job =>
          job.name === 'processReconcilePostNotifications' &&
          (job.data as { postId?: string }).postId === postId,
      ),
    ).toBe(true)
  })

  it('returns null for post jobs whose row no longer exists', async () => {
    await expect(
      handleOpenAIModerationOmniSingleJob(makeJob('post', randomUUID()), {} as Worker),
    ).resolves.toBeNull()
  })

  it('returns current image moderation state for already-moderated images', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const imageId = await insertTestImage(creator!.id)
    await setImageOpenAIModerationResults(imageId, [{ flagged: false }], false)

    await expect(
      handleOpenAIModerationOmniSingleJob(makeJob('image', imageId), {} as Worker),
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

    const postResult = (await handleOpenAIModerationOmniSingleJob(
      makeJob('backfill_posts', randomUUID()),
      {} as Worker,
    )) as { enqueued: number }
    const imageResult = (await handleOpenAIModerationOmniSingleJob(
      makeJob('backfill_images', randomUUID()),
      {} as Worker,
    )) as { enqueued: number }

    expect(postResult.enqueued).toBeGreaterThanOrEqual(1)
    expect(imageResult.enqueued).toBeGreaterThanOrEqual(1)

    const waitingJobs = await openai_moderation_omni_single.getJobs('waiting')
    expect(
      waitingJobs.some(job => job.name === 'post' && (job.data as { id?: string }).id === postId),
    ).toBe(true)
    expect(
      waitingJobs.some(job => job.name === 'image' && (job.data as { id?: string }).id === imageId),
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
    await ensureCurrentPostModerationVersion(duePostId)
    const expiredVersion = await ensureCurrentPostModerationVersion(expiredPostId)
    await expireTestPostModerationVersion(expiredVersion.id)

    const result = (await handleOpenAIModerationOmniSingleJob(
      makeJob('reconcile_post_moderation', randomUUID()),
      {} as Worker,
    )) as { enqueued: number; moved_to_review: number }

    expect(result.enqueued).toBeGreaterThanOrEqual(2)
    expect(result.moved_to_review).toBeGreaterThanOrEqual(1)
    await expect(getPostClearanceStatus(expiredPostId)).resolves.toBe('in_review')

    const openaiJobs = await readAllQueueJobs(openai_moderation_omni_single)
    expect(
      openaiJobs.some(job => job.name === 'post' && (job.data as { id?: string }).id === duePostId),
    ).toBe(true)
  })

  it('runs image quarantine reconciliation jobs', async () => {
    await expect(
      handleOpenAIModerationOmniSingleJob(
        makeJob('reconcile_image_quarantines', randomUUID()),
        {} as Worker,
      ),
    ).resolves.toEqual({ reconciled: 0 })
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
    vi.stubEnv('OPENAI_API_KEY', '')

    await expect(
      handleOpenAIModerationOmniSingleJob(makeJob('post', postId), {} as Worker),
    ).rejects.toThrow('OPENAI_API_KEY is not set')
    await expect(getTestPostModerationRetryDelayMinutes(postId, 'openai_omni')).resolves.toBe(5)
    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_flagged: null,
    })
  })

  it('rejects malformed and unknown jobs through the retry handler', async () => {
    await expect(
      handleOpenAIModerationOmniSingleJob(
        { data: {}, name: 'image' } as Job<{ id: string }>,
        {} as Worker,
      ),
    ).rejects.toThrow('Image job requires id in job.data')

    await expect(
      handleOpenAIModerationOmniSingleJob(makeJob('unexpected', randomUUID()), {} as Worker),
    ).rejects.toThrow('Unknown job type: unexpected')
  })
})

function makeJob(name: string, id: string): Job<{ id: string }> {
  return { data: { id }, name } as Job<{ id: string }>
}
