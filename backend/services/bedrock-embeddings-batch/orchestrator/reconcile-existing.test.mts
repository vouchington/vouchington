import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestBatch,
  createTestUserDirect,
  getTopicEmbeddingReference,
  insertTestEmbeddings,
  insertTestTopic,
  lockTopicEmbeddingRowForTest,
  makeRandomEmbedding,
  setTopicDeletedForEmbeddingTest,
  setTopicEmbeddingContentSha256,
} from '@voucha/test-helpers'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { copyExistingEmbeddings } from './reconcile-existing.mts'

describe('copyExistingEmbeddings', () => {
  it('advances one dirty candidate at a time across misses, deletion, batch locks, and row locks', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const makeTopic = (name: string) =>
      insertTestTopic({
        name: `${name} ${suffix}`,
        slug: `${name.toLowerCase()}-${suffix}`,
        createdById: user.id,
      })
    const boundary = await makeTopic('Boundary')
    const miss = await makeTopic('Miss')
    const deleted = await makeTopic('Deleted')
    const batchLocked = await makeTopic('BatchLocked')
    const rowLocked = await makeTopic('RowLocked')
    const reusable = await makeTopic('Reusable')
    const hashes = [miss, deleted, batchLocked, rowLocked, reusable].map(() => randomBytes(32))
    await Promise.all(
      [miss, deleted, batchLocked, rowLocked, reusable].map((id, index) =>
        setTopicEmbeddingContentSha256(id, hashes[index]!),
      ),
    )
    await insertTestEmbeddings(
      [deleted, batchLocked, rowLocked, reusable].map((_, index) => ({
        content_sha256: hashes[index + 1]!,
        embedding: makeRandomEmbedding(),
      })),
    )
    await setTopicDeletedForEmbeddingTest(deleted)
    await createTestBatch({ entityIds: [batchLocked], jobType: 'topics' })

    await using transaction = await beginTransaction()
    await lockTopicEmbeddingRowForTest(transaction, rowLocked)
    const scope = 'embedding-reconciliation:topics:id-asc'
    let after = encodeScopedUuidCursor(boundary, scope)
    const seen = new Set<string>()
    const copied = new Set<string>()
    for (let page = 0; page < 30 && !seen.has(reusable); page += 1) {
      const result = await copyExistingEmbeddings('topics', { after, limit: 1 })
      expect(result.scannedCount).toBe(1)
      expect(result.nextCursor).not.toBeNull()
      result.updatedIds.forEach(id => copied.add(id))
      after = result.nextCursor!
      seen.add(decodeScopedUuidCursor(after, scope, 'Invalid cursor').id)
    }
    for (const id of [miss, deleted, batchLocked, rowLocked, reusable]) {
      expect(seen.has(id)).toBe(true)
    }
    expect(copied.has(reusable)).toBe(true)
    expect(copied.has(miss)).toBe(false)
    expect(copied.has(deleted)).toBe(false)
    expect(copied.has(batchLocked)).toBe(false)
    expect(copied.has(rowLocked)).toBe(false)

    await transaction.commit()
    const retry = await copyExistingEmbeddings('topics', {
      after: encodeScopedUuidCursor(boundary, scope),
      limit: 100,
    })
    expect(retry.updatedIds).toContain(rowLocked)
  })

  it('rejects a cursor from another entity and an empty cursor', async () => {
    await expect(copyExistingEmbeddings('topics', { after: '' })).rejects.toThrow(
      'Invalid embedding reconciliation cursor',
    )
    await expect(
      copyExistingEmbeddings('topics', {
        after: encodeScopedUuidCursor(randomUUID(), 'embedding-reconciliation:posts:id-asc'),
      }),
    ).rejects.toThrow('Invalid embedding reconciliation cursor')
  })

  it('skips locked rows while copying other cached embeddings', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const boundaryTopicId = await insertTestTopic({
      name: `Copy Existing Boundary ${suffix}`,
      slug: `copy-existing-boundary-${suffix}`,
      createdById: user.id,
    })
    const lockedTopicId = await insertTestTopic({
      name: `Copy Existing Locked ${suffix}`,
      slug: `copy-existing-locked-${suffix}`,
      createdById: user.id,
    })
    const copiedTopicId = await insertTestTopic({
      name: `Copy Existing Unlocked ${suffix}`,
      slug: `copy-existing-unlocked-${suffix}`,
      createdById: user.id,
    })
    const lockedContentSha256 = randomBytes(32)
    const copiedContentSha256 = randomBytes(32)
    await setTopicEmbeddingContentSha256(lockedTopicId, lockedContentSha256)
    await setTopicEmbeddingContentSha256(copiedTopicId, copiedContentSha256)
    await insertTestEmbeddings([
      {
        content_sha256: lockedContentSha256,
        embedding: makeRandomEmbedding(),
      },
      {
        content_sha256: copiedContentSha256,
        embedding: makeRandomEmbedding(),
      },
    ])

    await using query = await beginTransaction()

    await lockTopicEmbeddingRowForTest(query, lockedTopicId)

    await expect(
      copyExistingEmbeddings('topics', {
        after: encodeScopedUuidCursor(boundaryTopicId, 'embedding-reconciliation:topics:id-asc'),
      }),
    ).resolves.toMatchObject({
      updatedIds: expect.arrayContaining([copiedTopicId]),
    })

    await query.commit()

    await expect(getTopicEmbeddingReference(lockedTopicId)).resolves.toMatchObject({
      bedrock_nova_multimodal_v1_embedding_created_at: null,
    })
    await expect(getTopicEmbeddingReference(copiedTopicId)).resolves.toMatchObject({
      bedrock_nova_multimodal_v1_content_sha256: copiedContentSha256,
      bedrock_nova_multimodal_v1_embedding_created_at: expect.any(Date),
    })
  })

  it('selects the table-specific lock clause before copying cached embeddings', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const boundaryTopicId = await insertTestTopic({
      name: `Copy Existing Boundary Lock ${suffix}`,
      slug: `copy-existing-boundary-lock-${suffix}`,
      createdById: user.id,
    })
    const topicId = await insertTestTopic({
      name: `Copy Existing Lock ${suffix}`,
      slug: `copy-existing-lock-${suffix}`,
      createdById: user.id,
    })
    const contentSha256 = randomBytes(32)
    await setTopicEmbeddingContentSha256(topicId, contentSha256)
    await insertTestEmbeddings([
      {
        content_sha256: contentSha256,
        embedding: makeRandomEmbedding(),
      },
    ])

    await expect(
      copyExistingEmbeddings('topics', {
        after: encodeScopedUuidCursor(boundaryTopicId, 'embedding-reconciliation:topics:id-asc'),
      }),
    ).resolves.toMatchObject({
      updatedIds: expect.arrayContaining([topicId]),
    })
    await expect(getTopicEmbeddingReference(topicId)).resolves.toMatchObject({
      bedrock_nova_multimodal_v1_content_sha256: contentSha256,
    })
  })
})
