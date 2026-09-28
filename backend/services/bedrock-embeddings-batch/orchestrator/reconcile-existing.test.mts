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
import {
  decodeScopedUuidCursor,
  decodeUuidCursor,
  encodeScopedUuidCursor,
  isSimpleCursor,
} from '@modules/pagination'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { copyExistingEmbeddings } from './reconcile-existing.mts'

describe('copyExistingEmbeddings', () => {
  it('rejects unsupported entities and unsafe page sizes before scanning', async () => {
    await expect(copyExistingEmbeddings('images' as 'topics')).rejects.toThrow(
      'Invalid table name: images',
    )
    for (const limit of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(copyExistingEmbeddings('topics', { limit })).rejects.toThrow(
        'Invalid embedding reconciliation page size',
      )
    }
  })

  it('returns an empty bounded page after the greatest UUID cursor', async () => {
    await expect(
      copyExistingEmbeddings('topics', {
        after: encodeScopedUuidCursor(
          'ffffffff-ffff-7fff-bfff-ffffffffffff',
          'embedding-reconciliation:topics:id-asc',
        ),
        limit: 1,
      }),
    ).resolves.toEqual({ updatedIds: [], scannedCount: 0, nextCursor: null })
  })

  it('advances one dirty candidate at a time across misses, deletion, batch locks, and row locks', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const makeTopic = (name: string) =>
      insertTestTopic({
        name: `${name} ${suffix}`,
        slug: `${name.toLowerCase()}-${suffix}`,
        createdById: user.id,
      })
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
    const cursorBefore = (id: string) => {
      const before = decodeUuidCursor(encodeUuidCursorBefore(id), isSimpleCursor, 'Invalid cursor')
      return encodeScopedUuidCursor(before.id, scope)
    }
    for (const id of [miss, deleted, batchLocked, rowLocked, reusable]) {
      const after = cursorBefore(id)
      const result = await copyExistingEmbeddings('topics', { after, limit: 1 })
      expect(result.scannedCount).toBe(1)
      expect(result.nextCursor).not.toBeNull()
      expect(decodeScopedUuidCursor(result.nextCursor!, scope, 'Invalid cursor').id).toBe(id)
      expect(result.updatedIds).toEqual(id === reusable ? [id] : [])
    }

    await transaction.commit()
    const retry = await copyExistingEmbeddings('topics', {
      after: cursorBefore(rowLocked),
      limit: 1,
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
