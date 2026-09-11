import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getImageEmbeddingState,
  insertTestImageWithSha256,
  makeRandomEmbedding,
} from '@voucha/test-helpers'
import { applyImageBatchUpdates } from './save-images.mts'

describe('applyImageBatchUpdates', () => {
  it('returns an empty array when given no items', async () => {
    await expect(applyImageBatchUpdates([])).resolves.toEqual([])
  })

  it('writes embedding and marks image updated for a single item', async () => {
    const user = await createTestUserDirect()
    const { id: imageId, sha256 } = await insertTestImageWithSha256(user.id)

    const result = await applyImageBatchUpdates([
      { entity_id: imageId, image_sha_256: sha256, embedding: makeRandomEmbedding() },
    ])

    expect(result).toContain(imageId)
    const state = await getImageEmbeddingState(imageId)
    expect(state?.bedrock_nova_multimodal_v1_embedding_created_at).not.toBeNull()
  })

  it('handles multiple items and returns all updated image ids', async () => {
    const user = await createTestUserDirect()
    const [imgA, imgB] = await Promise.all([
      insertTestImageWithSha256(user.id),
      insertTestImageWithSha256(user.id),
    ])

    const result = await applyImageBatchUpdates([
      { entity_id: imgA.id, image_sha_256: imgA.sha256, embedding: makeRandomEmbedding() },
      { entity_id: imgB.id, image_sha_256: imgB.sha256, embedding: makeRandomEmbedding() },
    ])

    expect(result).toContain(imgA.id)
    expect(result).toContain(imgB.id)
    const [stateA, stateB] = await Promise.all([
      getImageEmbeddingState(imgA.id),
      getImageEmbeddingState(imgB.id),
    ])
    expect(stateA?.bedrock_nova_multimodal_v1_embedding_created_at).not.toBeNull()
    expect(stateB?.bedrock_nova_multimodal_v1_embedding_created_at).not.toBeNull()
  })

  it('skips images whose sha_256 does not match any item', async () => {
    const user = await createTestUserDirect()
    const { id: imageId } = await insertTestImageWithSha256(user.id)
    const { sha256: wrongSha256 } = await insertTestImageWithSha256(user.id)

    const result = await applyImageBatchUpdates([
      { entity_id: imageId, image_sha_256: wrongSha256, embedding: makeRandomEmbedding() },
    ])

    expect(result).not.toContain(imageId)
    const state = await getImageEmbeddingState(imageId)
    expect(state?.bedrock_nova_multimodal_v1_embedding_created_at).toBeNull()
  })
})
