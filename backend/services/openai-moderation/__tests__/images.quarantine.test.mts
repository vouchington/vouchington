import {
  createTestUser,
  getImageModerationState,
  insertTestPost,
  insertTestPostImage,
  setImageOpenAIModerationResults,
} from '@voucha/test-helpers'
import { it, expect, afterEach, vi, beforeAll, beforeEach, describe } from 'vitest'
import { reconcilePendingImageQuarantines } from '../delete-flagged.mts'
import { upsertImageOpenAIModeration } from '../images.mts'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { getImageByAny } from '@services/images/get'
import { markImageComplete } from '@voucha/test-helpers/entities/images'
import type { OpenAI } from '@modules/openai-utils'
import * as s3Module from '@services/images/s3'
import * as s3Lifecycle from '@services/images/s3-upload-lifecycle'
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
    vi.spyOn(s3Module, 'uploadImageToS3').mockResolvedValue(
      {} as Awaited<ReturnType<typeof s3Module.uploadImageToS3>>,
    )
    vi.spyOn(s3Lifecycle, 'deleteKnownImageStorageFromS3').mockResolvedValue()
    vi.spyOn(s3Module, 'copyImageToQuarantine').mockResolvedValue(undefined)
    vi.spyOn(s3Module, 'deleteImageRenders').mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  async function createCompletedImage(): Promise<{ id: string; s3_key: string }> {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/png',
      contentLength: 1024,
      dependencies: imageUploadDependencies,
    })
    await markImageComplete(image_id)
    const image = await getImageByAny(image_id)
    if (!image) throw new Error('Expected completed image')
    return { id: image.id, s3_key: image.s3_key }
  }

  function createMockModeration(
    flagged: boolean,
    overrides?: Partial<OpenAI.Moderation>,
  ): OpenAI.Moderation {
    return {
      flagged,
      categories: {
        harassment: false,
        'harassment/threatening': false,
        hate: false,
        'hate/threatening': false,
        illicit: false,
        'illicit/violent': false,
        'self-harm': false,
        'self-harm/instructions': false,
        'self-harm/intent': false,
        sexual: false,
        'sexual/minors': false,
        violence: false,
        'violence/graphic': false,
        ...overrides?.categories,
      },
      category_scores: {
        harassment: 0.0,
        'harassment/threatening': 0.0,
        hate: 0.0,
        'hate/threatening': 0.0,
        illicit: 0.0,
        'illicit/violent': 0.0,
        'self-harm': 0.0,
        'self-harm/instructions': 0.0,
        'self-harm/intent': 0.0,
        sexual: 0.0,
        'sexual/minors': 0.0,
        violence: 0.0,
        'violence/graphic': 0.0,
        ...overrides?.category_scores,
      },
      category_applied_input_types: {
        harassment: [],
        'harassment/threatening': [],
        hate: [],
        'hate/threatening': [],
        illicit: [],
        'illicit/violent': [],
        'self-harm': ['image'],
        'self-harm/instructions': ['image'],
        'self-harm/intent': ['image'],
        sexual: ['image'],
        'sexual/minors': [],
        violence: ['image'],
        'violence/graphic': ['image'],
        ...overrides?.category_applied_input_types,
      },
      ...overrides,
    }
  }

  it('sexual/minors flag → quarantine copy, original deleted, renders deleted', async () => {
    const image = await createCompletedImage()
    createOpenAIModeration.mockResolvedValueOnce([
      createMockModeration(true, { categories: { 'sexual/minors': true } as never }),
    ])

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)
    expect(s3Module.copyImageToQuarantine).toHaveBeenCalledOnce()
    expect(s3Module.copyImageToQuarantine).toHaveBeenCalledWith(
      expect.objectContaining({ s3_key: image.s3_key }),
    )
    expect(s3Lifecycle.deleteKnownImageStorageFromS3).toHaveBeenCalled()
    expect(s3Module.deleteImageRenders).toHaveBeenCalledWith(image.s3_key)
    expect(s3Module.deleteImageRenders).toHaveBeenCalledWith(image.id)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('sexual/minors + copy throws → retains a blocked, pending image for reconciliation', async () => {
    const image = await createCompletedImage()
    createOpenAIModeration.mockResolvedValueOnce([
      createMockModeration(true, { categories: { 'sexual/minors': true } as never }),
    ])
    vi.spyOn(s3Module, 'copyImageToQuarantine').mockRejectedValueOnce(
      new Error('quarantine S3 unavailable'),
    )

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)
    expect(s3Module.copyImageToQuarantine).toHaveBeenCalledOnce()
    expect(s3Lifecycle.deleteKnownImageStorageFromS3).not.toHaveBeenCalled()
    expect(s3Module.deleteImageRenders).not.toHaveBeenCalled()
    await expect(getImageByAny(image.id)).resolves.toBeNull()
    await expect(getImageModerationState(image.id)).resolves.toMatchObject({
      deleted_at: null,
      quarantine_pending_at: expect.any(Date),
      quarantined_at: null,
    })
  })

  it('hides a pending quarantine from post rendering and rejects a new attachment', async () => {
    const image = await createCompletedImage()
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
      createMockModeration(true, { categories: { 'sexual/minors': true } as never }),
    ])
    vi.spyOn(s3Module, 'copyImageToQuarantine').mockRejectedValueOnce(
      new Error('quarantine S3 unavailable'),
    )

    await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    await expect(getPostByAny(postId)).resolves.toMatchObject({ images: [] })
    await expect(getPostImages(postId)).resolves.toEqual([])
    await expect(
      setPostImages(user, post, [{ image_id: image.id, order_index: 0 }]),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('reconciles a pending CSAM quarantine after its initial copy failure', async () => {
    const image = await createCompletedImage()
    createOpenAIModeration.mockResolvedValueOnce([
      createMockModeration(true, { categories: { 'sexual/minors': true } as never }),
    ])
    vi.spyOn(s3Module, 'copyImageToQuarantine').mockRejectedValueOnce(
      new Error('quarantine S3 unavailable'),
    )

    await upsertImageOpenAIModeration(image.id, imageModerationDependencies)
    await expect(reconcilePendingImageQuarantines()).resolves.toMatchObject({
      reconciled: expect.any(Number),
    })

    expect(vi.mocked(s3Module.copyImageToQuarantine).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(s3Lifecycle.deleteKnownImageStorageFromS3).toHaveBeenCalled()
    await expect(getImageByAny(image.id)).resolves.toBeNull()
    await expect(getImageModerationState(image.id)).resolves.toMatchObject({
      deleted_at: expect.any(Date),
      quarantined_at: expect.any(Date),
    })
  })

  it('harassment flag → quarantine not called, regular delete', async () => {
    const image = await createCompletedImage()
    createOpenAIModeration.mockResolvedValueOnce([
      createMockModeration(true, { categories: { harassment: true } as never }),
    ])

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)
    expect(s3Module.copyImageToQuarantine).not.toHaveBeenCalled()
    expect(s3Module.deleteImageRenders).not.toHaveBeenCalled()
    expect(s3Lifecycle.deleteKnownImageStorageFromS3).toHaveBeenCalled()
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('sexual/minors + renders delete throws → original still deleted', async () => {
    const image = await createCompletedImage()
    createOpenAIModeration.mockResolvedValueOnce([
      createMockModeration(true, { categories: { 'sexual/minors': true } as never }),
    ])
    vi.spyOn(s3Module, 'deleteImageRenders').mockRejectedValueOnce(
      new Error('renders S3 unavailable'),
    )

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)
    expect(s3Module.copyImageToQuarantine).toHaveBeenCalledOnce()
    expect(s3Lifecycle.deleteKnownImageStorageFromS3).toHaveBeenCalled()
    expect(s3Module.deleteImageRenders).toHaveBeenCalledWith(image.s3_key)
    expect(s3Module.deleteImageRenders).toHaveBeenCalledWith(image.id)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('already-moderated sexual/minors image → quarantine on retry', async () => {
    const image = await createCompletedImage()
    const flaggedModeration = createMockModeration(true, {
      categories: { 'sexual/minors': true } as never,
    })
    await setImageOpenAIModerationResults(image.id, [flaggedModeration], true)

    createOpenAIModeration.mockClear()

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('already_moderated_flagged')
    expect(s3Module.copyImageToQuarantine).toHaveBeenCalledOnce()
    expect(s3Module.deleteImageRenders).toHaveBeenCalledWith(image.s3_key)
    expect(s3Module.deleteImageRenders).toHaveBeenCalledWith(image.id)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })
})
