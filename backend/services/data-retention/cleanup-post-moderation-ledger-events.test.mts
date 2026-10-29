import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  acquirePostModerationLedgerRetentionTestLock,
  beginTransaction,
  createTestUser,
  getTestPostModerationRetentionState,
  insertTestPost,
  insertTestPostModerationDispositionAt,
  insertTestPostModerationVersionAt,
} from '@voucha/test-helpers'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import {
  getTestPostModerationDispositionDueAt,
  getTestPostModerationPostWork,
  getTestPostModerationVersionMarkers,
  setTestPostModerationRetentionHash,
} from '@voucha/test-helpers/post-moderation-retention-progress'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import { cleanupPostModerationLedger } from './cleanup-post-moderation-ledger.mts'
import { reconsiderChangedPostModerationPostById } from './cleanup-post-moderation-ledger-hash-work.mts'

async function createPost() {
  const user = await createTestUser()
  return insertTestPost({
    createdById: user.id,
    slug: `moderation-ledger-event-${randomUUID()}`,
    title: 'Moderation retention event',
    markdown: 'body',
    clearanceStatus: 'pending',
  })
}

describe('post moderation ledger retention events', () => {
  it('wakes a dormant current version only after an aged same-post successor exists', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const postId = await createPost()
    const oldHash = randomBytes(32)
    const successorHash = randomBytes(32)
    const oldId = uuidv7({ msecs: at(95).getTime() })
    const successorId = uuidv7({ msecs: at(91).getTime() })
    await setTestPostModerationRetentionHash(postId, oldHash)
    await insertTestPostModerationVersionAt({
      id: oldId,
      postId,
      contentSha256: oldHash,
      policyRevision: POST_MODERATION_POLICY_REVISION,
    })
    await insertTestPostModerationVersionAt({
      id: successorId,
      postId,
      contentSha256: successorHash,
      policyRevision: POST_MODERATION_POLICY_REVISION,
    })
    const options = {
      now,
      lowerBoundDate,
      retentionDays: 90,
      batchSize: 2,
      maxBatches: 1,
      kinds: ['superseded_versions'] as const,
    }
    await cleanupPostModerationLedger(options)
    expect(await getTestPostModerationVersionMarkers(oldId)).toMatchObject({
      dueAt: null,
      hashBlockedAt: expect.any(Date),
    })
    {
      await using query = await beginTransaction()
      await setTestPostModerationRetentionHash(postId, successorHash, query)
      expect(await getTestPostModerationPostWork(postId, query)).not.toBeNull()
      expect(await reconsiderChangedPostModerationPostById(query, postId, 2)).toMatchObject({
        processed: true,
      })
      expect((await getTestPostModerationVersionMarkers(oldId, query))?.dueAt).toEqual(at(91))
      expect(await getTestPostModerationPostWork(postId, query)).toBeNull()
      await query.commit()
    }
    await cleanupPostModerationLedger(options)
    expect(
      (await getTestPostModerationRetentionState({ versionIds: [oldId], dispositionIds: [] }))
        .versions,
    ).toEqual([])
  })

  it('keeps noncurrent pass evidence dormant, then clears it after a hash restoration', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const postId = await createPost()
    const versionHash = randomBytes(32)
    const otherHash = randomBytes(32)
    const versionId = uuidv7({ msecs: at(95).getTime() })
    const dispositionId = uuidv7({ msecs: at(94).getTime() })
    await setTestPostModerationRetentionHash(postId, versionHash)
    await insertTestPostModerationVersionAt({
      id: versionId,
      postId,
      contentSha256: versionHash,
      policyRevision: POST_MODERATION_POLICY_REVISION,
    })
    await insertTestPostModerationDispositionAt({
      id: dispositionId,
      versionId,
      source: 'openai_omni',
      disposition: 'pass',
      evidence: { private: 'old pass evidence' },
    })
    await setTestPostModerationRetentionHash(postId, otherHash)
    const options = {
      now,
      lowerBoundDate,
      retentionDays: 90,
      batchSize: 2,
      maxBatches: 1,
      kinds: ['pass_evidence'] as const,
    }
    await cleanupPostModerationLedger(options)
    expect(await getTestPostModerationDispositionDueAt(dispositionId)).toBeNull()
    {
      await using query = await beginTransaction()
      await setTestPostModerationRetentionHash(postId, versionHash, query)
      await reconsiderChangedPostModerationPostById(query, postId, 2)
      expect(await getTestPostModerationDispositionDueAt(dispositionId, query)).toEqual(at(94))
      await query.commit()
    }
    await cleanupPostModerationLedger(options)
    const state = await getTestPostModerationRetentionState({
      versionIds: [versionId],
      dispositionIds: [dispositionId],
    })
    expect(state.versions).toEqual([versionId])
    expect(state.dispositions[0]?.evidence).toEqual({})
  })

  it('pages one post’s dormant pass evidence without losing its disposition cursor', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const postId = await createPost()
    const versionHash = randomBytes(32)
    const otherHash = randomBytes(32)
    const versionId = uuidv7({ msecs: at(96).getTime() })
    const dispositionIds = [95, 94, 93].map(days => uuidv7({ msecs: at(days).getTime() }))
    await setTestPostModerationRetentionHash(postId, versionHash)
    await insertTestPostModerationVersionAt({
      id: versionId,
      postId,
      contentSha256: versionHash,
      policyRevision: POST_MODERATION_POLICY_REVISION,
    })
    for (const id of dispositionIds) {
      await insertTestPostModerationDispositionAt({
        id,
        versionId,
        source: 'openai_omni',
        disposition: 'pass',
        evidence: { pass: true },
      })
    }
    await setTestPostModerationRetentionHash(postId, otherHash)
    await cleanupPostModerationLedger({
      now,
      lowerBoundDate,
      retentionDays: 90,
      batchSize: 3,
      maxBatches: 1,
      kinds: ['pass_evidence'],
    })
    await using query = await beginTransaction()
    await setTestPostModerationRetentionHash(postId, versionHash, query)
    expect(await reconsiderChangedPostModerationPostById(query, postId, 1)).toMatchObject({
      processed: true,
      hasMore: true,
    })
    expect((await getTestPostModerationPostWork(postId, query))?.cursorDispositionId).toBe(
      dispositionIds[0],
    )
    expect(await reconsiderChangedPostModerationPostById(query, postId, 1)).toMatchObject({
      processed: true,
      hasMore: true,
    })
    expect(await reconsiderChangedPostModerationPostById(query, postId, 1)).toMatchObject({
      processed: true,
    })
    expect(await getTestPostModerationPostWork(postId, query)).toBeNull()
    for (const id of dispositionIds)
      expect(await getTestPostModerationDispositionDueAt(id, query)).not.toBeNull()
    await query.commit()
  })
})
