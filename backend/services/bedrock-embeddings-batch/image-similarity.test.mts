import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImageWithSha256,
  insertTestPost,
  insertTestPostImage,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  markImageDeleted,
  markImageModerationFlagged,
} from '@voucha/test-helpers'
import {
  createCopyrightNoticeAggregate,
  resolveCopyrightImagePlacement,
} from '@services/copyright-notices'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { applyImageBatchUpdates } from './orchestrator/save-images.mts'
import { findCopyrightImageSimilarityCandidates } from './image-similarity.mts'

describe('findCopyrightImageSimilarityCandidates', () => {
  it('returns only delivery-eligible placement candidates without exposing the source vector', async () => {
    const owner = await createTestUser()
    const source = await createPlacedImage(owner.id)
    const matching = await createPlacedImage(owner.id)
    const deleted = await createPlacedImage(owner.id)
    const flagged = await createPlacedImage(owner.id)
    const embedding = makeRandomEmbedding()

    await applyImageBatchUpdates([
      toEmbeddingBatchItem(source.image, embedding),
      toEmbeddingBatchItem(matching.image, makeNearbyEmbedding(embedding, 0.01)),
      toEmbeddingBatchItem(deleted.image, makeNearbyEmbedding(embedding, 0.01)),
      toEmbeddingBatchItem(flagged.image, makeNearbyEmbedding(embedding, 0.01)),
    ])
    await Promise.all([
      markImageDeleted(deleted.image.id),
      markImageModerationFlagged(flagged.image.id),
    ])

    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: owner.id,
      claimantDisplayName: 'Copyright claimant',
      claimantContactCiphertext: 'ciphertext',
      workDescription: 'Original image',
      policyVersion: 'test',
      targets: [
        await resolveCopyrightImagePlacement({
          postId: source.postId,
          imageId: source.image.id,
          hostedUseUrl: 'https://voucha.ai',
        }),
      ],
      initialSubmission: { kind: 'notice', sourceKind: 'staff', bodyCiphertext: 'ciphertext' },
    })
    const targetId = await readCopyrightNoticeTargetId(notice.id)

    const result = await findCopyrightImageSimilarityCandidates({
      noticeId: notice.id,
      targetId,
      limit: 10,
    })

    expect(result.availability).toBe('available')
    expect(result.sourceImageId).toBe(source.image.id)
    expect(result.candidates).toContainEqual(
      expect.objectContaining({
        imageId: matching.image.id,
        postId: matching.postId,
        placementId: expect.any(String),
        placementRevision: 0,
        similarity: expect.any(Number),
      }),
    )
    const candidateImageIds = result.candidates.map(candidate => candidate.imageId)
    expect(candidateImageIds).not.toContain(source.image.id)
    expect(candidateImageIds).not.toContain(deleted.image.id)
    expect(candidateImageIds).not.toContain(flagged.image.id)
  })

  it('returns unavailable when the notice target has no image embedding', async () => {
    const owner = await createTestUser()
    const source = await createPlacedImage(owner.id)
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: owner.id,
      claimantDisplayName: 'Copyright claimant',
      claimantContactCiphertext: 'ciphertext',
      workDescription: 'Original image',
      policyVersion: 'test',
      targets: [
        await resolveCopyrightImagePlacement({
          postId: source.postId,
          imageId: source.image.id,
          hostedUseUrl: 'https://voucha.ai',
        }),
      ],
      initialSubmission: { kind: 'notice', sourceKind: 'staff', bodyCiphertext: 'ciphertext' },
    })
    const targetId = await readCopyrightNoticeTargetId(notice.id)

    await expect(
      findCopyrightImageSimilarityCandidates({ noticeId: notice.id, targetId }),
    ).resolves.toEqual({
      availability: 'unavailable',
      candidates: [],
      sourceImageId: source.image.id,
    })
  })
})

async function createPlacedImage(userId: string) {
  const postId = await insertTestPost({
    title: `Copyright image similarity ${crypto.randomUUID()}`,
    slug: `copyright-image-similarity-${crypto.randomUUID()}`,
    createdById: userId,
    markdown: 'Image similarity fixture.',
  })
  const image = await insertTestImageWithSha256(userId)
  await insertTestPostImage({ postId, imageId: image.id })
  return { postId, image }
}

function toEmbeddingBatchItem(
  image: { id: string; sha256: Buffer },
  embedding: number[],
): { entity_id: string; image_sha_256: Buffer; embedding: number[] } {
  return { entity_id: image.id, image_sha_256: image.sha256, embedding }
}
