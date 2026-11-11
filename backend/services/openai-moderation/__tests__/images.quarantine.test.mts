import {
  createOpenAIModerationResponse,
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
import { afterAll, it, expect, afterEach, vi, beforeAll, beforeEach, describe } from 'vitest'
import * as moderation from '@modules/openai-utils/moderate'
import { processPendingImageQuarantinePage } from '../delete-flagged.mts'
import { seedImageQuarantineStorage } from '../../../test-helpers/image-quarantine-s3.mts'
import { upsertImageOpenAIModeration } from '../images.mts'
import { getImageByAny } from '@services/images/get'
import type { PrivateUser } from '@services/users/types'
import { getPostByAny } from '@services/posts/get'
import { getPostImages, setPostImages } from '@services/posts/images'
import type { Post } from '@services/posts/types'

// The OpenAI call is the provider edge; everything above it runs for real.
const requestOpenAIModeration = vi.spyOn(moderation, 'requestOpenAIModeration')

describe('image quarantine', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    requestOpenAIModeration.mockReset()
    requestOpenAIModeration.mockRejectedValue(new Error('Unexpected OpenAI request'))
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  afterAll(() => {
    // Leave the real provider function in place for later files in this fork.
    requestOpenAIModeration.mockRestore()
  })

  it('sexual/minors flag → quarantine copy, original deleted, renders deleted', async () => {
    const image = await createCompletedModerationImage(user)
    const storage = await seedImageQuarantineStorage(image)
    requestOpenAIModeration.mockResolvedValueOnce(
      createOpenAIModerationResponse(true, { 'sexual/minors': true }),
    )

    const result = await upsertImageOpenAIModeration(image.id)

    expect(result.flagged).toBe(true)
    await expect(storage.quarantineCopy()).resolves.toBe(storage.original)
    await expect(storage.storedOriginalKeys()).resolves.toEqual([])
    await expect(storage.storedRenderKeys()).resolves.toEqual([])
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('sexual/minors + copy fails → retains a blocked, pending image for reconciliation', async () => {
    const image = await createCompletedModerationImage(user)
    // No original to copy: the emulator rejects the quarantine copy with NoSuchKey.
    const storage = await seedImageQuarantineStorage(image, { original: false })
    requestOpenAIModeration.mockResolvedValueOnce(
      createOpenAIModerationResponse(true, { 'sexual/minors': true }),
    )

    const result = await upsertImageOpenAIModeration(image.id)

    expect(result.flagged).toBe(true)
    await expect(storage.quarantineCopy()).resolves.toBeUndefined()
    await expect(storage.storedRenderKeys()).resolves.toEqual(storage.renderKeys)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
    await expect(getImageModerationState(image.id)).resolves.toMatchObject({
      deleted_at: null,
      quarantine_pending_at: expect.any(Date),
      quarantined_at: null,
    })
  })

  it('hides a pending quarantine from post rendering and rejects a new attachment', async () => {
    const image = await createCompletedModerationImage(user)
    await seedImageQuarantineStorage(image, { original: false })
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
    requestOpenAIModeration.mockResolvedValueOnce(
      createOpenAIModerationResponse(true, { 'sexual/minors': true }),
    )

    await upsertImageOpenAIModeration(image.id)

    await expect(getPostByAny(postId)).resolves.toMatchObject({ images: [] })
    await expect(getPostImages(postId)).resolves.toEqual([])
    await expect(
      setPostImages(user, post, [{ image_id: image.id, order_index: 0 }]),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('reconciles a pending CSAM quarantine after its initial copy failure', async () => {
    const image = await createCompletedModerationImage(user)
    const storage = await seedImageQuarantineStorage(image, { original: false })
    requestOpenAIModeration.mockResolvedValueOnce(
      createOpenAIModerationResponse(true, { 'sexual/minors': true }),
    )

    await upsertImageOpenAIModeration(image.id)
    await expect(storage.quarantineCopy()).resolves.toBeUndefined()
    await storage.storeOriginal()
    await expect(processPendingImageQuarantinePage([{ id: image.id }])).resolves.toMatchObject({
      reconciled: 1,
    })

    await expect(storage.quarantineCopy()).resolves.toBe(storage.original)
    await expect(storage.storedOriginalKeys()).resolves.toEqual([])
    await expect(storage.storedRenderKeys()).resolves.toEqual([])
    await expect(getImageByAny(image.id)).resolves.toBeNull()
    await expect(getImageModerationState(image.id)).resolves.toMatchObject({
      deleted_at: expect.any(Date),
      quarantined_at: expect.any(Date),
    })
  })

  it('harassment flag → quarantine not called, regular delete', async () => {
    const image = await createCompletedModerationImage(user)
    const storage = await seedImageQuarantineStorage(image)
    requestOpenAIModeration.mockResolvedValueOnce(
      createOpenAIModerationResponse(true, { harassment: true }),
    )

    const result = await upsertImageOpenAIModeration(image.id)

    expect(result.flagged).toBe(true)
    await expect(storage.quarantineCopy()).resolves.toBeUndefined()
    await expect(storage.storedOriginalKeys()).resolves.toEqual([])
    // Render cleanup runs only for quarantined images.
    await expect(storage.storedRenderKeys()).resolves.toEqual(storage.renderKeys)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('sexual/minors + renders cleanup fails → original still deleted', async () => {
    const image = await createCompletedModerationImage(user)
    const storage = await seedImageQuarantineStorage(image)
    requestOpenAIModeration.mockResolvedValueOnce(
      createOpenAIModerationResponse(true, { 'sexual/minors': true }),
    )
    storage.failRenders()

    const result = await upsertImageOpenAIModeration(image.id)

    expect(result.flagged).toBe(true)
    await expect(storage.quarantineCopy()).resolves.toBe(storage.original)
    await expect(storage.storedOriginalKeys()).resolves.toEqual([])
    await expect(storage.storedRenderKeys()).resolves.toEqual(storage.renderKeys)
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })

  it('already-moderated sexual/minors image → quarantine on retry', async () => {
    const image = await createCompletedModerationImage(user)
    const storage = await seedImageQuarantineStorage(image)
    const flaggedModeration = createImageModerationResult(true, {
      categories: { 'sexual/minors': true } as never,
    })
    await setImageOpenAIModerationResults(image.id, [flaggedModeration], true)

    const result = await upsertImageOpenAIModeration(image.id)

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('already_moderated_flagged')
    await expect(storage.quarantineCopy()).resolves.toBe(storage.original)
    await expect(storage.storedOriginalKeys()).resolves.toEqual([])
    await expect(storage.storedRenderKeys()).resolves.toEqual([])
    await expect(getImageByAny(image.id)).resolves.toBeNull()
  })
})
