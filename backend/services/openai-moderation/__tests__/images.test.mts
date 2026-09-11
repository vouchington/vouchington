import { createTestUser, setImageOpenAIModerationResults } from '@voucha/test-helpers'
import { it, expect, afterEach, vi, beforeAll, beforeEach, describe } from 'vitest'
import { upsertImageOpenAIModeration } from '../images.mts'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { getImageByAny } from '@services/images/get'
import { markImageComplete } from '@voucha/test-helpers/entities/images'
import type { OpenAI } from '@modules/openai-utils'
import * as s3Module from '@services/images/s3'
import * as s3Lifecycle from '@services/images/s3-upload-lifecycle'
import * as imageEmbeddingEnqueues from '@queues/bedrock-embeddings-batch/enqueues'
import type { PrivateUser } from '@services/users/types'

const presignImageUploadUrl = vi.fn<VitestLooseMock>(({ s3Key }: { s3Key: string }) =>
  Promise.resolve(`https://images.example.test/${s3Key}?signature=fake`),
)
const createOpenAIModeration = vi.fn<VitestLooseMock>()
const imageUploadDependencies = { presignImageUploadUrl }
const imageModerationDependencies = { createOpenAIModeration }

describe('images', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.spyOn(s3Module, 'uploadImageToS3').mockResolvedValue(
      {} as Awaited<ReturnType<typeof s3Module.uploadImageToS3>>,
    )
    vi.spyOn(s3Lifecycle, 'deleteKnownImageStorageFromS3').mockResolvedValue()
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
        // Text-only categories do not apply when only image inputs are sent
        harassment: [],
        'harassment/threatening': [],
        hate: [],
        'hate/threatening': [],
        illicit: [],
        'illicit/violent': [],
        // Image-capable categories report 'image' when the input is an image URL
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

  it('upsertImageOpenAIModeration - moderates image and stores results', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('NODE_ENV', 'development')

    const image = await createCompletedImage()
    // Mock moderation to return not flagged
    createOpenAIModeration.mockResolvedValueOnce([createMockModeration(false)])

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(false)
    expect(result.results).toBeDefined()

    // Verify moderation was saved to database
    const updated = await getImageByAny(image.id)
    expect(updated?.openai_omni_moderation_results).toBeDefined()
    expect(updated?.openai_omni_moderation_flagged).toBe(false)
    expect(updated?.openai_omni_moderation_created_at).toBeDefined()
    expect(updated?.deleted_at).toBeNull()
    expect(createOpenAIModeration).toHaveBeenCalledWith(
      [],
      [`https://images.example.com/images/${image.s3_key}?w=1200`],
    )
  }, 15000)

  it('upsertImageOpenAIModeration - uses stored S3 key for direct uploads', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('NODE_ENV', 'test')

    const { image_id: imageId } = await createImageUploadUrl(user, {
      contentType: 'image/png',
      contentLength: 1024,
      dependencies: imageUploadDependencies,
    })
    await markImageComplete(imageId)
    const image = await getImageByAny(imageId)
    if (!image) throw new Error('Expected completed image')
    createOpenAIModeration.mockResolvedValueOnce([createMockModeration(false)])

    const result = await upsertImageOpenAIModeration(imageId, imageModerationDependencies)

    expect(result.flagged).toBe(false)
    expect(createOpenAIModeration).toHaveBeenCalledWith(
      [],
      [`https://images.example.com/images/${image.s3_key}?w=1200`],
    )
  })

  it('upsertImageOpenAIModeration - handles image embedding enqueue failures', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('NODE_ENV', 'test')
    const enqueueSpy = vi
      .spyOn(imageEmbeddingEnqueues, 'enqueueCreateImageEmbeddingsBatch')
      .mockRejectedValueOnce(new Error('test image embedding enqueue failure'))

    try {
      const image = await createCompletedImage()
      createOpenAIModeration.mockResolvedValueOnce([createMockModeration(false)])

      const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

      expect(result.flagged).toBe(false)
      await vi.waitFor(() => expect(enqueueSpy).toHaveBeenCalledTimes(1))
    } finally {
      enqueueSpy.mockRestore()
    }
  })

  it('upsertImageOpenAIModeration - skips moderation when the image origin is non-public', async () => {
    vi.stubEnv('IMAGE_LAMBDA_PORT', '3903')
    vi.stubEnv('IMAGE_ORIGIN', '')
    vi.stubEnv('NODE_ENV', 'test')

    const image = await createCompletedImage()

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result).toEqual({ skipped: true, reason: 'non_public_image_origin' })
    expect(createOpenAIModeration).not.toHaveBeenCalled()
  })

  it('upsertImageOpenAIModeration - deletes flagged image', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    const image = await createCompletedImage()
    // Mock moderation to return flagged
    const flaggedModeration = createMockModeration(true)
    flaggedModeration.categories.sexual = true
    createOpenAIModeration.mockResolvedValueOnce([flaggedModeration])

    const result = await upsertImageOpenAIModeration(image.id, imageModerationDependencies)

    expect(result.flagged).toBe(true)

    // Verify image was deleted
    const deleted = await getImageByAny(image.id)
    expect(deleted).toBeNull() // getImageByAny excludes deleted images
  })

  it('upsertImageOpenAIModeration - retries deletion for already-moderated flagged image', async () => {
    const image = await createCompletedImage()
    const flaggedModeration = createMockModeration(true)
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
    const image = await createCompletedImage()

    createOpenAIModeration.mockResolvedValueOnce([createMockModeration(false)])
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
