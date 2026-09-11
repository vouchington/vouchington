import { createTestUser, setImageOpenAIModerationResults } from '@voucha/test-helpers'
import { it, expect, afterEach, vi, beforeAll, beforeEach, describe } from 'vitest'
import { upsertImageOpenAIModeration } from '../images.mts'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { getImageByAny } from '@services/images/get'
import { markImageComplete } from '@voucha/test-helpers/entities/images'
import type { OpenAI } from '@modules/openai-utils'
import * as s3Module from '@services/images/s3'
import * as s3Lifecycle from '@services/images/s3-upload-lifecycle'
import type { PrivateUser } from '@services/users/types'

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

  it('sexual/minors + copy throws → original still deleted, renders still deleted', async () => {
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
    expect(s3Lifecycle.deleteKnownImageStorageFromS3).toHaveBeenCalled()
    expect(s3Module.deleteImageRenders).toHaveBeenCalledWith(image.s3_key)
    expect(s3Module.deleteImageRenders).toHaveBeenCalledWith(image.id)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
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
