import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestAiUsageRecord,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  embeddingBatchExistsForRetentionTest,
  insertEmbeddingBatchForRetentionTest,
  insertTextEmbeddingForRetentionTest,
  resetAiRetentionCursorForTest,
  insertReportReceiptForRetentionTest,
  reportReceiptCiphertextForRetentionTest,
  textEmbeddingExistsForRetentionTest,
  textEmbeddingBloomRebuildStateForTest,
  insertProviderResponseKeyForRetentionTest,
  providerResponseKeyExistsForRetentionTest,
  resetProviderResponseKeyRetentionCursorForTest,
} from '@voucha/test-helpers/entities/ai-retention'
import {
  insertCompletedModerationWorkForRetentionTest,
  moderationRetentionStateForTest,
} from '@voucha/test-helpers/entities/ai-retention-moderation'
import { cleanupTextEmbeddingCache } from '../cleanup-text-embeddings.mts'
import { cleanupTerminalEmbeddingBatches } from '../cleanup-embedding-batches.mts'
import { cleanupTerminalModerationWork } from '../cleanup-moderation-work.mts'
import { eraseOldAgentCallReceipts } from '../cleanup-report-receipts.mts'
import { cleanupOldProviderResponseKeys } from '../cleanup-provider-response-keys.mts'
import { acknowledgeEmbeddingBloomRebuild } from '../../bedrock-embeddings/bloom-filter/retention-acknowledgement.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('AI and embedding retention', () => {
  it('retires only old provider response keys in bounded pages', async () => {
    const now = new Date()
    const old = new Date(now.getTime() - 100 * DAY_MS)
    const recent = new Date(now.getTime() - 10 * DAY_MS)
    const usageIds = await Promise.all([
      insertTestAiUsageRecord(),
      insertTestAiUsageRecord(),
      insertTestAiUsageRecord(),
    ])
    await using query = await beginTransaction()
    await resetProviderResponseKeyRetentionCursorForTest(query)
    const keys = await Promise.all([
      insertProviderResponseKeyForRetentionTest(query, usageIds[0]!, old),
      insertProviderResponseKeyForRetentionTest(query, usageIds[1]!, old),
      insertProviderResponseKeyForRetentionTest(query, usageIds[2]!, recent),
    ])
    const first = await cleanupOldProviderResponseKeys({
      now,
      batchSize: 1,
      maxBatches: 1,
      keyIds: keys,
      query,
    })
    expect(first).toMatchObject({ deleted: 1, hasMore: true })
    const second = await cleanupOldProviderResponseKeys({
      now,
      batchSize: 1,
      maxBatches: 1,
      keyIds: keys,
      query,
    })
    expect(second).toMatchObject({ deleted: 1, hasMore: false })
    expect(
      await Promise.all(keys.map(id => providerResponseKeyExistsForRetentionTest(query, id))),
    ).toEqual([false, false, true])
  })

  it('resumes text-cache eviction and retains recent vectors', async () => {
    await using query = await beginTransaction()
    await resetAiRetentionCursorForTest(query, 'text')
    const now = new Date()
    const old = new Date(now.getTime() - 100 * DAY_MS)
    const recent = new Date(now.getTime() - 10 * DAY_MS)
    const hashes = await Promise.all([
      insertTextEmbeddingForRetentionTest(query, old),
      insertTextEmbeddingForRetentionTest(query, old),
      insertTextEmbeddingForRetentionTest(query, recent),
    ])
    const options = { now, batchSize: 1, maxBatches: 1, contentHashes: hashes, query }
    const first = await cleanupTextEmbeddingCache(options)
    expect(first).toMatchObject({ deleted: 1, hasMore: true })
    expect(first.continuation).not.toBeNull()
    const second = await cleanupTextEmbeddingCache(options)
    expect(second).toMatchObject({ deleted: 1, hasMore: false, continuation: null })
    expect(
      await Promise.all(hashes.map(hash => textEmbeddingExistsForRetentionTest(query, hash))),
    ).toEqual([false, false, true])
    expect(await textEmbeddingBloomRebuildStateForTest(query)).toEqual({
      generation: 2,
      needed: true,
    })
    await acknowledgeEmbeddingBloomRebuild('1', query)
    expect(await textEmbeddingBloomRebuildStateForTest(query)).toEqual({
      generation: 2,
      needed: true,
    })
    await acknowledgeEmbeddingBloomRebuild('2', query)
    expect(await textEmbeddingBloomRebuildStateForTest(query)).toEqual({
      generation: 2,
      needed: false,
    })
  })

  it('deletes only terminal old batches and preserves active tracking', async () => {
    await using query = await beginTransaction()
    await resetAiRetentionCursorForTest(query, 'batch')
    const now = new Date()
    const ids = await Promise.all([
      insertEmbeddingBatchForRetentionTest(query, new Date(now.getTime() - 40 * DAY_MS)),
      insertEmbeddingBatchForRetentionTest(query, new Date(now.getTime() - 2 * DAY_MS)),
      insertEmbeddingBatchForRetentionTest(query, null),
    ])
    const result = await cleanupTerminalEmbeddingBatches({
      now,
      batchSize: 1,
      maxBatches: 2,
      batchIds: ids,
      query,
    })
    expect(result).toMatchObject({ deleted: 1, hasMore: false })
    expect(
      await Promise.all(ids.map(id => embeddingBatchExistsForRetentionTest(query, id))),
    ).toEqual([false, true, true])
  })

  it('preserves a disposition while cascading completed work and attempts', async () => {
    const user = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'AI retention fixture',
      slug: `ai-retention-${v7()}`,
      markdown: 'AI retention fixture',
      createdById: user.id,
    })
    await using query = await beginTransaction()
    await resetAiRetentionCursorForTest(query, 'moderation')
    const now = new Date()
    const { versionId, dispositionId } = await insertCompletedModerationWorkForRetentionTest(
      query,
      postId,
      new Date(now.getTime() - 100 * DAY_MS),
    )
    const result = await cleanupTerminalModerationWork({
      now,
      batchSize: 1,
      maxBatches: 1,
      versionIds: [versionId],
      query,
    })
    expect(result).toMatchObject({ deleted: 1, hasMore: false })
    expect(await moderationRetentionStateForTest(query, versionId, dispositionId)).toEqual({
      work: false,
      attempts: 0,
      dispositionAttemptId: null,
    })
  })

  it('erases old paid-call ciphertext while retaining replay identity', async () => {
    const user = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'Receipt retention fixture',
      slug: `receipt-retention-${v7()}`,
      markdown: 'Receipt retention fixture',
      createdById: user.id,
    })
    await using query = await beginTransaction()
    await resetAiRetentionCursorForTest(query, 'receipt')
    const now = new Date()
    const old = new Date(now.getTime() - 40 * DAY_MS)
    const recent = new Date(now.getTime() - 2 * DAY_MS)
    const ids = await Promise.all([
      insertReportReceiptForRetentionTest(query, postId, { reservedAt: old, completedAt: old }),
      insertReportReceiptForRetentionTest(query, postId, {
        reservedAt: recent,
        completedAt: recent,
      }),
      insertReportReceiptForRetentionTest(query, postId, { reservedAt: now, completedAt: now }),
      insertReportReceiptForRetentionTest(query, postId, { reservedAt: old, completedAt: recent }),
    ])
    const result = await eraseOldAgentCallReceipts({
      now,
      batchSize: 1,
      maxBatches: 4,
      receiptIds: ids,
      query,
    })
    expect(result).toMatchObject({ deleted: 1, hasMore: false })
    expect(
      await Promise.all(ids.map(id => reportReceiptCiphertextForRetentionTest(query, id))),
    ).toEqual([null, 'encrypted-test-result', 'encrypted-test-result', 'encrypted-test-result'])
  })
})
