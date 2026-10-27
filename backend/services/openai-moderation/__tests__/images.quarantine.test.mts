import {
  createTestUser,
  getImageModerationState,
  insertTestPost,
  insertTestPostImage,
  setImageOpenAIModerationResults,
} from '@voucha/test-helpers'
import {
  createCompletedModerationImage,
  createImageModerationResult,
} from '@voucha/test-helpers/services/openai-moderation/image-moderation'
import { it, expect, afterEach, vi, beforeAll, beforeEach, describe } from 'vitest'
import { processPendingImageQuarantinePage } from '../delete-flagged.mts'
import { observeImageQuarantineS3 } from '../../../test-helpers/image-quarantine-s3.mts'
import { upsertImageOpenAIModeration } from '../images.mts'
import { getImageByAny } from '@services/images/get'
import type { PrivateUser } from '@services/users/types'
import { getPostByAny } from '@services/posts/get'
import { getPostImages, setPostImages } from '@services/posts/images'
import type { Post } from '@services/posts/types'

const presignImageUploadUrl = vi.fn<VitestLooseMock>(({ s3Key }: { s3Key: string }) =>
  Promise.resolve(`https://images.example.test/${s3Key}?signature=fake`),
)
const createOpenAIModeration = vi.fn<VitestLooseMock>()
const imageUploadDependencies = { presignImageUploadUrl }
const imageModerationDependencies = { createOpenAIModeration }

describe('image quarantine', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('sexual/minors flag → quarantine copy, original deleted, renders deleted', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    const storage = observeImageQuarantineS3(image)
    createOpenAIModeration.mockResolvedValueOnce([
      createImageModerationResult(true, { categories: { 'sexual/minors': true } as never }),
    ])

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)
    expect(storage.copies()).toHaveLength(1)
    expect(storage.copies()[0]!.input).toMatchObject({
      Bucket: storage.quarantineBucket,
      Key: image.s3_key,
      CopySource: `${storage.imagesBucket}/${image.s3_key}`,
    })
    expect(storage.calls[0]).toBe(storage.copies()[0])
    expect(storage.deletes().length).toBeGreaterThan(0)
    expect(storage.renderLists().map(command => command.input.Prefix)).toEqual(
      [...new Set([image.s3_key, image.id])].map(key => `${key}--`),
    )
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('sexual/minors + copy throws → retains a blocked, pending image for reconciliation', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    const storage = observeImageQuarantineS3(image)
    createOpenAIModeration.mockResolvedValueOnce([
      createImageModerationResult(true, { categories: { 'sexual/minors': true } as never }),
    ])
    storage.failCopy(new Error('quarantine S3 unavailable'))

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)
    expect(storage.copies()).toHaveLength(1)
    expect(storage.deletes()).toHaveLength(0)
    expect(storage.renderLists()).toHaveLength(0)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
    await expect(getImageModerationState(image.id)).resolves.toMatchObject({
      deleted_at: null,
      quarantine_pending_at: expect.any(Date),
      quarantined_at: null,
    })
  })

  it('hides a pending quarantine from post rendering and rejects a new attachment', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    const storage = observeImageQuarantineS3(image)
    const suffix = crypto.randomUUID()
    const postId = await insertTestPost({
      title: `Pending quarantine ${suffix}`,
      slug: `pending-quarantine-${suffix}`,
      markdown: 'Post already referencing the image',
      createdById: user.id,
      clearanceStatus: 'approved',
    })
    await insertTestPostImage({ postId, imageId: image.id })
    const post = (await getPostByAny(postId, { readOnly: false })) as Post
    createOpenAIModeration.mockResolvedValueOnce([
      createImageModerationResult(true, { categories: { 'sexual/minors': true } as never }),
    ])
    storage.failCopy(new Error('quarantine S3 unavailable'))

    await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    await expect(getPostByAny(postId)).resolves.toMatchObject({ images: [] })
    await expect(getPostImages(postId)).resolves.toEqual([])
    await expect(
      setPostImages(user, post, [{ image_id: image.id, order_index: 0 }]),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('reconciles a pending CSAM quarantine after its initial copy failure', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    const storage = observeImageQuarantineS3(image)
    createOpenAIModeration.mockResolvedValueOnce([
      createImageModerationResult(true, { categories: { 'sexual/minors': true } as never }),
    ])
    storage.failCopy(new Error('quarantine S3 unavailable'))

    await upsertImageOpenAIModeration(image.id, imageModerationDependencies)
    await expect(processPendingImageQuarantinePage([{ id: image.id }])).resolves.toMatchObject({
      reconciled: 1,
    })

    expect(storage.copies()).toHaveLength(2)
    expect(storage.deletes().length).toBeGreaterThan(0)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
    await expect(getImageModerationState(image.id)).resolves.toMatchObject({
      deleted_at: expect.any(Date),
      quarantined_at: expect.any(Date),
    })
  })

  it('harassment flag → quarantine not called, regular delete', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    const storage = observeImageQuarantineS3(image)
    createOpenAIModeration.mockResolvedValueOnce([
      createImageModerationResult(true, { categories: { harassment: true } as never }),
    ])

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)
    expect(storage.copies()).toHaveLength(0)
    expect(storage.renderLists()).toHaveLength(0)
    expect(storage.deletes().length).toBeGreaterThan(0)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('sexual/minors + renders delete throws → original still deleted', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    const storage = observeImageQuarantineS3(image)
    createOpenAIModeration.mockResolvedValueOnce([
      createImageModerationResult(true, { categories: { 'sexual/minors': true } as never }),
    ])
    storage.failRenders(new Error('renders S3 unavailable'))

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)
    expect(storage.copies()).toHaveLength(1)
    expect(storage.deletes().length).toBeGreaterThan(0)
    expect(storage.renderLists().map(command => command.input.Prefix)).toEqual(
      [...new Set([image.s3_key, image.id])].map(key => `${key}--`),
    )
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('already-moderated sexual/minors image → quarantine on retry', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    const storage = observeImageQuarantineS3(image)
    const flaggedModeration = createImageModerationResult(true, {
      categories: { 'sexual/minors': true } as never,
    })
    await setImageOpenAIModerationResults(image.id, [flaggedModeration], true)

    createOpenAIModeration.mockClear()

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('already_moderated_flagged')
    expect(storage.copies()).toHaveLength(1)
    expect(storage.renderLists().map(command => command.input.Prefix)).toEqual(
      [...new Set([image.s3_key, image.id])].map(key => `${key}--`),
    )
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })
})
