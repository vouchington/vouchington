import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  countPostImageRevisions,
  getTestCurrentPostClearance,
  insertTestImage,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import {
  createTestPostDeliveryFixture,
  expectTestPostDeliveryRestored,
} from '@voucha/test-helpers/media-delivery-post'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { createPostRevision } from '@services/post-revisions'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { createPostImageRollbackFixture } from '@voucha/test-helpers/services/posts/images.fixtures'
import { repairFailedImageDeliveryMutation } from '@services/media-delivery-safety'
import { createPostModerationContent } from '../content.mts'
import { getPostModerationInput } from '../moderation-input.mts'
import { getPostImages, setPostImages } from '../images.mts'
import { rollbackPostImages } from '../images-rollback.mts'

describe('image transaction SQL failure recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('propagates an actual capacity SQL error and restores all owner and slot writes before any edge denial', async () => {
    const fixture = await createTestPostDeliveryFixture()
    const before = await getPostImages(fixture.postId)
    const replacement = await insertTestImage(fixture.user.id)
    const { result, error } = await withPostgresQueryFailureForTest(
      '/* reserveImagePlacementChanges:projectPolicy */',
      () =>
        setPostImages(fixture.user, fixture.post, [
          { image_id: replacement, order_index: 0 },
        ]).catch((err: unknown) => err),
    )
    expect(result).toBe(error)
    expect(error).toMatchObject({ code: '25P02' })
    await expect(getPostImages(fixture.postId)).resolves.toEqual(before)
    expect(fixture.edge.put).not.toHaveBeenCalled()
    expect(fixture.edge.records.get(fixture.deliveryKey)?.state).toBe('allow')
  })

  it('propagates a non-capacity rollback SQL failure and repairs its already-published denial', async () => {
    const fixture = await createTestPostDeliveryFixture()
    const before = await getPostImages(fixture.postId)
    const replacement = await insertTestImage(fixture.user.id)
    const content = await getPostModerationInput(fixture.postId, { readOnly: false })
    const hash = createPostModerationContent(content!).content_sha256
    await setPostLLMModerationContentSha256(fixture.postId, hash)
    const clearance = await getTestCurrentPostClearance(fixture.postId)
    const revision = await createPostRevision(
      fixture.postId,
      'update',
      { post_images: { before: [replacement], after: [fixture.imageId] } },
      fixture.user.id,
    )
    const { result, error } = await withPostgresQueryFailureForTest(
      '/* createPostRevision */',
      () =>
        rollbackPostImages(
          fixture.postId,
          createPostImageRollbackFixture({
            revisionId: revision.id,
            currentImages: before,
            images: [{ image_id: replacement, order_index: 0, caption: '' }],
            currentLlmModerationContentSha256: hash,
            currentClearanceVersion: clearance!.clearance_version,
          }),
        ).catch((err: unknown) => err),
      { command: 'INSERT' },
    )
    expect(result).toBe(error)
    expect(error).toMatchObject({ code: '25P02' })
    await expect(getPostImages(fixture.postId)).resolves.toEqual(before)
    await expect(countPostImageRevisions(fixture.postId)).resolves.toBe(1)
    expect(fixture.edge.records.get(fixture.deliveryKey)?.state).toBe('withheld')
    await repairFailedImageDeliveryMutation({
      postIds: [fixture.postId],
      imageIds: [fixture.imageId, replacement],
    })
    await expectTestPostDeliveryRestored(fixture)
  })

  it('rejects an owner change committed after its snapshot without changing images or denying delivery', async () => {
    const fixture = await createTestPostDeliveryFixture()
    const before = await getPostImages(fixture.postId)
    const replacement = await insertTestImage(fixture.user.id)
    const content = await getPostModerationInput(fixture.postId, { readOnly: false })
    const hash = createPostModerationContent(content!).content_sha256
    await setPostLLMModerationContentSha256(fixture.postId, hash)
    const clearance = await getTestCurrentPostClearance(fixture.postId)
    let changed = false
    const restore = beforePostgresTransactionQueryForTest(
      '/* rollbackPostImages:restoreOwner */',
      values => values.includes(fixture.postId),
      async () => {
        await setPostLLMModerationContentSha256(fixture.postId, Buffer.alloc(32, 7))
        changed = true
      },
    )
    try {
      await expect(
        rollbackPostImages(
          fixture.postId,
          createPostImageRollbackFixture({
            currentImages: before,
            images: [{ image_id: replacement, order_index: 0, caption: '' }],
            currentLlmModerationContentSha256: hash,
            currentClearanceVersion: clearance!.clearance_version,
          }),
        ),
      ).resolves.toBe(false)
    } finally {
      restore()
    }
    expect(changed).toBe(true)
    await expect(getPostImages(fixture.postId)).resolves.toEqual(before)
    await expect(countPostImageRevisions(fixture.postId)).resolves.toBe(0)
    expect(fixture.edge.put).not.toHaveBeenCalled()
    expect(fixture.edge.records.get(fixture.deliveryKey)?.state).toBe('allow')
  })
})
