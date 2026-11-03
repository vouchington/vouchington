import {
  createOpenAIModerationResponse,
  createTestUser,
  setImageOpenAIModerationResults,
} from '@voucha/test-helpers'
import {
  createCompletedModerationImage,
  createImageModerationResult,
} from '@voucha/test-helpers/services/openai-moderation/image-moderation'
import { afterAll, it, expect, afterEach, vi, beforeAll, beforeEach, describe } from 'vitest'
import * as moderation from '@modules/openai-utils/moderate'
import { upsertImageOpenAIModeration } from '../images.mts'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { getImageByAny } from '@services/images/get'
import { markImageComplete } from '@voucha/test-helpers/entities/images'
import * as s3Lifecycle from '@services/images/s3-upload-lifecycle'
import * as imageEmbeddingEnqueues from '@queues/bedrock-embeddings-batch/enqueues'
import type { PrivateUser } from '@services/users/types'

// The OpenAI call is the provider edge; everything above it runs for real.
const requestOpenAIModeration = vi.spyOn(moderation, 'requestOpenAIModeration')

/** The single image URL production sent to the provider, as a parsed private S3 read URL. */
function sentImageUrl(): URL {
  expect(requestOpenAIModeration).toHaveBeenCalledOnce()
  const [input] = requestOpenAIModeration.mock.calls[0]!
  expect(input).toHaveLength(1)
  const [image] = input as Array<{ type: string; image_url: { url: string } }>
  expect(image!.type).toBe('image_url')
  return new URL(image!.image_url.url)
}

describe('images', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    requestOpenAIModeration.mockReset()
    requestOpenAIModeration.mockRejectedValue(new Error('Unexpected OpenAI request'))
    vi.spyOn(s3Lifecycle, 'deleteKnownImageStorageFromS3').mockResolvedValue()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  afterAll(() => {
    // Leave the real provider function in place for later files in this fork.
    requestOpenAIModeration.mockRestore()
  })

  it('upsertImageOpenAIModeration - moderates image and stores results', async () => {
    const image = await createCompletedModerationImage(user)
    requestOpenAIModeration.mockResolvedValueOnce(createOpenAIModerationResponse())

    const result = await upsertImageOpenAIModeration(image.id)

    expect(result.flagged).toBe(false)
    expect(result.results).toBeDefined()

    // Verify moderation was saved to database
    const updated = await getImageByAny(image.id)
    expect(updated?.openai_omni_moderation_results).toBeDefined()
    expect(updated?.is_flagged_by_openai_omni_moderation).toBe(false)
    expect(updated?.openai_omni_moderation_created_at).toBeDefined()
    expect(updated?.deleted_at).toBeNull()
    const sent = sentImageUrl()
    expect(sent.pathname.endsWith(`/${image.s3_key}`)).toBe(true)
    expect(sent.searchParams.get('X-Amz-Expires')).toBe('300')
  })

  it('upsertImageOpenAIModeration - uses stored S3 key for direct uploads', async () => {
    const { image_id: imageId } = await createImageUploadUrl(user, {
      contentType: 'image/png',
      contentLength: 1024,
    })
    await markImageComplete(imageId)
    const image = await getImageByAny(imageId)
    if (!image) throw new Error('Expected completed image')
    requestOpenAIModeration.mockResolvedValueOnce(createOpenAIModerationResponse())

    const result = await upsertImageOpenAIModeration(imageId)

    expect(result.flagged).toBe(false)
    const sent = sentImageUrl()
    expect(sent.pathname.endsWith(`/${image.s3_key}`)).toBe(true)
    expect(sent.searchParams.get('X-Amz-Expires')).toBe('300')
  })

  it('upsertImageOpenAIModeration - handles image embedding enqueue failures', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('NODE_ENV', 'test')
    const enqueueSpy = vi
      .spyOn(imageEmbeddingEnqueues, 'enqueueCreateImageEmbeddingsBatch')
      .mockRejectedValueOnce(new Error('test image embedding enqueue failure'))

    try {
      const image = await createCompletedModerationImage(user)
      requestOpenAIModeration.mockResolvedValueOnce(createOpenAIModerationResponse())

      const result = await upsertImageOpenAIModeration(image.id)

      expect(result.flagged).toBe(false)
      await expect(enqueueSpy.mock.results[0]?.value).rejects.toThrow(
        'test image embedding enqueue failure',
      )
      expect(enqueueSpy).toHaveBeenCalledTimes(1)
    } finally {
      enqueueSpy.mockRestore()
    }
  })

  it('upsertImageOpenAIModeration - uses a private S3 read URL without an image origin', async () => {
    const image = await createCompletedModerationImage(user)
    requestOpenAIModeration.mockResolvedValueOnce(createOpenAIModerationResponse())

    const result = await upsertImageOpenAIModeration(image.id)

    expect(result.flagged).toBe(false)
    expect(sentImageUrl().pathname.endsWith(`/${image.s3_key}`)).toBe(true)
  })

  it('upsertImageOpenAIModeration - deletes flagged image', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    const image = await createCompletedModerationImage(user)
    requestOpenAIModeration.mockResolvedValueOnce(
      createOpenAIModerationResponse(true, { sexual: true }),
    )

    const result = await upsertImageOpenAIModeration(image.id)

    expect(result.flagged).toBe(true)

    // Verify image was deleted
    const deleted = await getImageByAny(image.id)
    expect(deleted).toBeNull() // getImageByAny excludes deleted images
  })

  it('upsertImageOpenAIModeration - retries deletion for already-moderated flagged image', async () => {
    const image = await createCompletedModerationImage(user)
    const flaggedModeration = createImageModerationResult(true)
    await setImageOpenAIModerationResults(image.id, [flaggedModeration], true)

    const result = await upsertImageOpenAIModeration(image.id)

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('already_moderated_flagged')
    expect(requestOpenAIModeration).not.toHaveBeenCalled()
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('upsertImageOpenAIModeration - skips re-moderation for already-moderated image', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    // The sha_256 column has a UNIQUE constraint, so two image rows can never
    // share a hash. The cross-image reuse branch is structurally unreachable in
    // production. The reachable skip path is "this exact image was already
    // moderated" — calling upsertImageOpenAIModeration twice should short-circuit
    // on the second call.
    const image = await createCompletedModerationImage(user)

    requestOpenAIModeration.mockResolvedValueOnce(createOpenAIModerationResponse())
    await upsertImageOpenAIModeration(image.id)
    expect(requestOpenAIModeration).toHaveBeenCalledOnce()

    // Second moderation should detect existing results and skip the API call
    const result2 = await upsertImageOpenAIModeration(image.id)

    expect(result2.skipped).toBe(true)
    expect(result2.reason).toBe('already_moderated')
    expect(requestOpenAIModeration).toHaveBeenCalledOnce()
  })
})
