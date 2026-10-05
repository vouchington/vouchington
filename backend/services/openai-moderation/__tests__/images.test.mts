import { createTestUser, setImageOpenAIModerationResults } from '@voucha/test-helpers'
import {
  createCompletedModerationImage,
  createImageModerationResult,
} from '@voucha/test-helpers/services/openai-moderation/image-moderation'
import { it, expect, afterEach, vi, beforeAll, beforeEach, describe } from 'vitest'
import { upsertImageOpenAIModeration } from '../images.mts'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { getImageByAny } from '@services/images/get'
import { markImageComplete } from '@voucha/test-helpers/entities/images'
import * as s3Lifecycle from '@services/images/s3-upload-lifecycle'
import * as imageEmbeddingEnqueues from '@queues/bedrock-embeddings-batch/enqueues'
import type { PrivateUser } from '@services/users/types'

const presignImageUploadUrl = vi.fn<VitestLooseMock>(({ s3Key }: { s3Key: string }) =>
  Promise.resolve(`https://images.example.test/${s3Key}?signature=fake`),
)
const createOpenAIModeration = vi.fn<VitestLooseMock>()
const presignImageReadUrl = vi.fn<VitestLooseMock>((s3Key: string) =>
  Promise.resolve(`https://private-images.example.test/${s3Key}?signature=fake`),
)
const imageUploadDependencies = { presignImageUploadUrl }
const imageModerationDependencies = { createOpenAIModeration, presignImageReadUrl }

describe('images', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.spyOn(s3Lifecycle, 'deleteKnownImageStorageFromS3').mockResolvedValue()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('upsertImageOpenAIModeration - moderates image and stores results', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    // Mock moderation to return not flagged
    createOpenAIModeration.mockResolvedValueOnce([createImageModerationResult(false)])

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(false)
    expect(result.results).toBeDefined()

    // Verify moderation was saved to database
    const updated = await getImageByAny(image.id)
    expect(updated?.openai_omni_moderation_results).toBeDefined()
    expect(updated?.is_flagged_by_openai_omni_moderation).toBe(false)
    expect(updated?.openai_omni_moderation_created_at).toBeDefined()
    expect(updated?.deleted_at).toBeNull()
    expect(createOpenAIModeration).toHaveBeenCalledWith(
      [],
      [`https://private-images.example.test/${image.s3_key}?signature=fake`],
    )
  }, 15000)

  it('upsertImageOpenAIModeration - uses stored S3 key for direct uploads', async () => {
    const { image_id: imageId } = await createImageUploadUrl(user, {
      contentType: 'image/png',
      contentLength: 1024,
      dependencies: imageUploadDependencies,
    })
    await markImageComplete(imageId)
    const image = await getImageByAny(imageId)
    if (!image) throw new Error('Expected completed image')
    createOpenAIModeration.mockResolvedValueOnce([createImageModerationResult(false)])

    const result = await upsertImageOpenAIModeration(imageId, imageModerationDependencies)

    expect(result.flagged).toBe(false)
    expect(createOpenAIModeration).toHaveBeenCalledWith(
      [],
      [`https://private-images.example.test/${image.s3_key}?signature=fake`],
    )
  })

  it('upsertImageOpenAIModeration - handles image embedding enqueue failures', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('NODE_ENV', 'test')
    const enqueueSpy = vi
      .spyOn(imageEmbeddingEnqueues, 'enqueueCreateImageEmbeddingsBatch')
      .mockRejectedValueOnce(new Error('test image embedding enqueue failure'))

    try {
      const image = await createCompletedModerationImage(user, imageUploadDependencies)
      createOpenAIModeration.mockResolvedValueOnce([createImageModerationResult(false)])

      const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

      expect(result.flagged).toBe(false)
      await vi.waitFor(() => expect(enqueueSpy).toHaveBeenCalledTimes(1))
    } finally {
      enqueueSpy.mockRestore()
    }
  })

  it('upsertImageOpenAIModeration - uses a private S3 read URL without an image origin', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    createOpenAIModeration.mockResolvedValueOnce([createImageModerationResult(false)])

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(false)
    expect(presignImageReadUrl).toHaveBeenCalledWith(image.s3_key)
  })

  it('upsertImageOpenAIModeration - deletes flagged image', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    // Mock moderation to return flagged
    const flaggedModeration = createImageModerationResult(true)
    flaggedModeration.categories.sexual = true
    createOpenAIModeration.mockResolvedValueOnce([flaggedModeration])

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)

    // Verify image was deleted
    const deleted = await getImageByAny(image.id)
    expect(deleted).toBeNull() // getImageByAny excludes deleted images
  })

  it('upsertImageOpenAIModeration - retries deletion for already-moderated flagged image', async () => {
    const image = await createCompletedModerationImage(user, imageUploadDependencies)
    const flaggedModeration = createImageModerationResult(true)
    await setImageOpenAIModerationResults(image.id, [flaggedModeration], true)

    createOpenAIModeration.mockClear()

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('already_moderated_flagged')
    expect(createOpenAIModeration).not.toHaveBeenCalled()
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('upsertImageOpenAIModeration - skips re-moderation for already-moderated image', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    // The sha_256 column has a UNIQUE constraint, so two image rows can never
    // share a hash. The cross-image reuse branch is structurally unreachable in
    // production. The reachable skip path is "this exact image was already
    // moderated" — calling upsertImageOpenAIModeration twice should short-circuit
    // on the second call.
    const image = await createCompletedModerationImage(user, imageUploadDependencies)

    createOpenAIModeration.mockResolvedValueOnce([createImageModerationResult(false)])
    await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    // Clear mock to verify it's not called again
    createOpenAIModeration.mockClear()

    // Second moderation should detect existing results and skip the API call
    const result2 = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result2.skipped).toBe(true)
    expect(result2.reason).toBe('already_moderated')
    expect(createOpenAIModeration).not.toHaveBeenCalled()
  })
})
