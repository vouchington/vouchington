import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  createTestUserDirect,
  expireTestPostModerationVersion,
  getPostClearanceStatus,
  insertTestAiUsageRecord,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  embeddingBatchExistsForRetentionTest,
  insertEmbeddingBatchForRetentionTest,
  insertTextEmbeddingForRetentionTest,
  textEmbeddingExistsForRetentionTest,
  insertProviderResponseKeyForRetentionTest,
  providerResponseKeyExistsForRetentionTest,
} from '@voucha/test-helpers/entities/ai-retention'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { deleteModerationWorkForAdmissionTest } from '@voucha/test-helpers/entities/ai-retention-moderation'
import { cleanupTextEmbeddingCache } from '../cleanup-text-embeddings.mts'
import { cleanupTerminalEmbeddingBatches } from '../cleanup-embedding-batches.mts'
import { cleanupOldProviderResponseKeys } from '../cleanup-provider-response-keys.mts'
import {
  countTestPostModerationIncompleteWork,
  getTestPostModerationWorkAttemptCount,
} from '@voucha/test-helpers/post-moderation-attempt-state'
import {
  beginPostModerationAttempt,
  ensureCurrentPostModerationVersion,
  reconcilePostModerationWork,
  recordPostModerationDisposition,
} from '../../post-clearance/moderation-ledger.mts'
import { checkPostClearance } from '../../post-clearance/check-clearance.mts'

describe('AI and embedding retention', () => {
  it('retires only old provider response keys in bounded pages', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const usageIds = await Promise.all([
      insertTestAiUsageRecord(),
      insertTestAiUsageRecord(),
      insertTestAiUsageRecord(),
    ])
    await using setup = await beginTransaction()
    const keys = await Promise.all([
      insertProviderResponseKeyForRetentionTest(setup, usageIds[0]!, at(100)),
      insertProviderResponseKeyForRetentionTest(setup, usageIds[1]!, at(100)),
      insertProviderResponseKeyForRetentionTest(setup, usageIds[2]!, at(10)),
    ])
    await setup.commit()
    await using reader = await beginTransaction()
    const options = { now, lowerBoundDate, batchSize: 1, maxBatches: 1 }
    expect(await cleanupOldProviderResponseKeys(options)).toMatchObject({
      deleted: 1,
      hasMore: true,
    })
    expect(await cleanupOldProviderResponseKeys(options)).toMatchObject({
      deleted: 1,
      hasMore: false,
    })
    expect(
      await Promise.all(keys.map(id => providerResponseKeyExistsForRetentionTest(reader, id))),
    ).toEqual([false, false, true])
  })

  it('resumes text-cache eviction and retains recent vectors', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    await using setup = await beginTransaction()
    const hashes = await Promise.all([
      insertTextEmbeddingForRetentionTest(setup, at(100)),
      insertTextEmbeddingForRetentionTest(setup, at(100)),
      insertTextEmbeddingForRetentionTest(setup, at(10)),
    ])
    await setup.commit()
    await using reader = await beginTransaction()
    const options = { now, lowerBoundDate, batchSize: 1, maxBatches: 1 }
    expect(await cleanupTextEmbeddingCache(options)).toMatchObject({ deleted: 1, hasMore: true })
    expect(await cleanupTextEmbeddingCache(options)).toMatchObject({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(
      await Promise.all(hashes.map(hash => textEmbeddingExistsForRetentionTest(reader, hash))),
    ).toEqual([false, false, true])
  })

  it('deletes only terminal old batches and preserves active tracking', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    await using setup = await beginTransaction()
    const ids = await Promise.all([
      insertEmbeddingBatchForRetentionTest(setup, at(40)),
      insertEmbeddingBatchForRetentionTest(setup, at(2)),
      insertEmbeddingBatchForRetentionTest(setup, null),
    ])
    await setup.commit()
    await using reader = await beginTransaction()
    const result = await cleanupTerminalEmbeddingBatches({
      now,
      lowerBoundDate,
      batchSize: 1,
      maxBatches: 2,
    })
    expect(result).toMatchObject({ deleted: 1, hasMore: false })
    expect(
      await Promise.all(ids.map(id => embeddingBatchExistsForRetentionTest(reader, id))),
    ).toEqual([false, true, true])
  })

  it('does not recreate deleted terminal moderation work for unchanged approved content', async () => {
    const user = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'Moderation replay retention fixture',
      slug: `moderation-replay-retention-${v7()}`,
      markdown: 'Unchanged approved content',
      createdById: user.id,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)
    for (const source of ['openai_omni', 'spam_detection'] as const) {
      expect(
        await recordPostModerationDisposition({
          versionId: version.id,
          source,
          disposition: 'pass',
          reasonCode: 'provider_pass',
        }),
      ).toBe(true)
    }
    await checkPostClearance(postId)
    expect(await getPostClearanceStatus(postId)).toBe('approved')

    await deleteModerationWorkForAdmissionTest(version.id)
    expect(await beginPostModerationAttempt(postId, 'openai_omni')).toBeNull()
    await expireTestPostModerationVersion(version.id)

    expect((await ensureCurrentPostModerationVersion(postId)).id).toBe(version.id)
    expect(await getTestPostModerationWorkAttemptCount(postId, 'openai_omni')).toBeNull()
    expect(await getTestPostModerationWorkAttemptCount(postId, 'spam_detection')).toBeNull()
    expect(await countTestPostModerationIncompleteWork(postId)).toBe(0)
    expect((await reconcilePostModerationWork(undefined, [postId])).exhausted_post_ids).toEqual([])
    await checkPostClearance(postId)
    expect(await getPostClearanceStatus(postId)).toBe('approved')
  })

  it('still admits work for an incomplete-only moderation version after source work deletion', async () => {
    const user = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'Incomplete moderation retention fixture',
      slug: `moderation-incomplete-retention-${v7()}`,
      markdown: 'Incomplete automated moderation',
      createdById: user.id,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)
    await expireTestPostModerationVersion(version.id)
    expect((await reconcilePostModerationWork(undefined, [postId])).exhausted_post_ids).toEqual([
      postId,
    ])
    await deleteModerationWorkForAdmissionTest(version.id)

    expect((await ensureCurrentPostModerationVersion(postId)).id).toBe(version.id)
    expect(await countTestPostModerationIncompleteWork(postId)).toBe(2)
  })
})
