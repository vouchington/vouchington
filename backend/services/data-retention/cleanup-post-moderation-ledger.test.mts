import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  acquirePostModerationLedgerRetentionTestLock,
  createTestExpiryWindow,
  createTestUser,
  getTestPostModerationRetentionState,
  insertTestPost,
  insertTestPostModerationAttemptAt,
  insertTestPostModerationDispositionAt,
  insertTestPostModerationVersionAt,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import { cleanupPostModerationLedger } from './cleanup-post-moderation-ledger.mts'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import { revertPostDuringTestModerationRetention } from '@voucha/test-helpers/post-moderation-retention-lock'

const DAY_MS = 86_400_000

// The randomized future UUIDv7 interval keeps the shared dirty database outside this test's scan.
describe('post moderation ledger retention', () => {
  it('waits for a content reversion and rechecks the now-current version', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const cutoff = createTestExpiryWindow().firstEligibleDate
    const oldAt = new Date(cutoff.getTime() - DAY_MS)
    const oldHash = randomBytes(32)
    const successorHash = randomBytes(32)
    const user = await createTestUser()
    const postId = await insertTestPost({
      createdById: user.id,
      slug: `retention-reversion-${randomUUID()}`,
      title: 'Concurrent moderation reversion',
      markdown: 'body',
      clearanceStatus: 'pending',
    })
    await setPostLLMModerationContentSha256(postId, successorHash)
    const oldId = uuidv7({ msecs: oldAt.getTime() })
    const successorId = uuidv7({ msecs: cutoff.getTime() })
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
    const result = await revertPostDuringTestModerationRetention({
      postId,
      contentSha256: oldHash,
      start: () =>
        cleanupPostModerationLedger({
          kinds: ['superseded_versions'],
          batchSize: 2,
          maxBatches: 1,
          retentionDays: 90,
          now: new Date(cutoff.getTime() + 90 * DAY_MS),
          lowerBoundDate: new Date(oldAt.getTime() - 1),
        }),
    })
    expect(result).toMatchObject({ deletedVersions: 0, hasMore: false })
    const state = await getTestPostModerationRetentionState({
      versionIds: [oldId, successorId],
      dispositionIds: [],
    })
    expect(state.versions).toEqual([oldId, successorId])
  })

  it('resumes capped pages and preserves current, recent, review, and staff decisions', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const window = createTestExpiryWindow()
    const cutoff = window.firstEligibleDate
    const oldAt = new Date(cutoff.getTime() - DAY_MS)
    const justNewerAt = new Date(cutoff.getTime() + 1)
    const lowerBoundDate = new Date(oldAt.getTime() - 1)
    const now = new Date(cutoff.getTime() + 90 * DAY_MS)
    const user = await createTestUser()
    const createPost = async () =>
      insertTestPost({
        createdById: user.id,
        slug: `mod-retention-${randomUUID()}`,
        title: 'Moderation retention',
        markdown: 'body',
        clearanceStatus: 'pending',
      })
    const [eligiblePost, recentPost, revertedPost, noSuccessorPost] = await Promise.all([
      createPost(),
      createPost(),
      createPost(),
      createPost(),
    ])
    const hash = () => randomBytes(32)
    const eligibleOldHash = hash()
    const eligibleCurrentHash = hash()
    const recentOldHash = hash()
    const recentCurrentHash = hash()
    const revertedOldHash = hash()
    const revertedSuccessorHash = hash()
    const noSuccessorHash = hash()
    await Promise.all([
      setPostLLMModerationContentSha256(eligiblePost, eligibleCurrentHash),
      setPostLLMModerationContentSha256(recentPost, recentCurrentHash),
      setPostLLMModerationContentSha256(revertedPost, revertedOldHash),
      setPostLLMModerationContentSha256(noSuccessorPost, hash()),
    ])
    const versionIds = {
      eligibleOld: uuidv7({ msecs: oldAt.getTime(), seq: 1 }),
      eligibleCurrent: uuidv7({ msecs: cutoff.getTime(), seq: 2 }),
      recentOld: uuidv7({ msecs: oldAt.getTime(), seq: 3 }),
      recentCurrent: uuidv7({ msecs: justNewerAt.getTime(), seq: 4 }),
      revertedOld: uuidv7({ msecs: oldAt.getTime(), seq: 5 }),
      revertedSuccessor: uuidv7({ msecs: cutoff.getTime(), seq: 6 }),
      noSuccessor: uuidv7({ msecs: oldAt.getTime(), seq: 7 }),
    }
    for (const [id, postId, contentSha256] of [
      [versionIds.eligibleOld, eligiblePost, eligibleOldHash],
      [versionIds.eligibleCurrent, eligiblePost, eligibleCurrentHash],
      [versionIds.recentOld, recentPost, recentOldHash],
      [versionIds.recentCurrent, recentPost, recentCurrentHash],
      [versionIds.revertedOld, revertedPost, revertedOldHash],
      [versionIds.revertedSuccessor, revertedPost, revertedSuccessorHash],
      [versionIds.noSuccessor, noSuccessorPost, noSuccessorHash],
    ] as const) {
      await insertTestPostModerationVersionAt({
        id,
        postId,
        contentSha256,
        policyRevision: POST_MODERATION_POLICY_REVISION,
      })
    }
    const attemptId = uuidv7({ msecs: oldAt.getTime(), seq: 8 })
    const oldDispositionId = uuidv7({ msecs: oldAt.getTime(), seq: 9 })
    await insertTestPostModerationAttemptAt({
      id: attemptId,
      versionId: versionIds.eligibleOld,
      source: 'openai_omni',
    })
    await insertTestPostModerationDispositionAt({
      id: oldDispositionId,
      versionId: versionIds.eligibleOld,
      source: 'openai_omni',
      disposition: 'pass',
      evidence: { old: true },
      attemptId,
    })
    const passAtBoundaryId = uuidv7({ msecs: cutoff.getTime(), seq: 10 })
    const passJustNewerId = uuidv7({ msecs: justNewerAt.getTime(), seq: 11 })
    const reviewId = uuidv7({ msecs: oldAt.getTime(), seq: 12 })
    const staffId = uuidv7({ msecs: oldAt.getTime(), seq: 13 })
    const staffRejectId = uuidv7({ msecs: oldAt.getTime() + 1, seq: 14 })
    const stalePassIds = Array.from({ length: 7 }, (_, index) =>
      uuidv7({ msecs: oldAt.getTime() + 2 + index, seq: 15 + index }),
    )
    for (const id of stalePassIds) {
      await insertTestPostModerationDispositionAt({
        id,
        versionId: versionIds.noSuccessor,
        source: 'openai_omni',
        disposition: 'pass',
        evidence: { no_successor: true },
      })
    }
    await insertTestPostModerationDispositionAt({
      id: passAtBoundaryId,
      versionId: versionIds.eligibleCurrent,
      source: 'openai_omni',
      disposition: 'pass',
      evidence: { clear: true },
    })
    await insertTestPostModerationDispositionAt({
      id: passJustNewerId,
      versionId: versionIds.eligibleCurrent,
      source: 'openai_omni',
      disposition: 'pass',
      evidence: { recent: true },
    })
    await insertTestPostModerationDispositionAt({
      id: reviewId,
      versionId: versionIds.eligibleCurrent,
      source: 'spam_detection',
      disposition: 'review',
      evidence: { preserve: true },
    })
    await insertTestPostModerationDispositionAt({
      id: staffId,
      versionId: versionIds.eligibleCurrent,
      source: 'staff',
      disposition: 'pass',
      evidence: { staff: true },
      actorUserId: user.id,
    })
    await insertTestPostModerationDispositionAt({
      id: staffRejectId,
      versionId: versionIds.eligibleCurrent,
      source: 'staff',
      disposition: 'reject',
      evidence: { reject: true },
      actorUserId: user.id,
    })

    const options = { now, lowerBoundDate, retentionDays: 90, batchSize: 2, maxBatches: 1 }
    const pending = await cleanupPostModerationLedger({
      ...options,
      kinds: ['pass_evidence'],
      batchSize: 1,
    })
    expect(pending.hasMore).toBe(true)
    const stricterWindow = await cleanupPostModerationLedger({
      ...options,
      kinds: ['pass_evidence'],
      batchSize: 20,
      now: new Date(now.getTime() - DAY_MS),
    })
    expect(stricterWindow.clearedPassEvidence).toBe(0)
    expect(stricterWindow.hasMore).toBe(false)
    let sawContinuation = false
    let sawOnlyPassEvidence = false
    let deletedVersions = 0
    let clearedPassEvidence = 0
    let kinds: Array<'superseded_versions' | 'pass_evidence'> | undefined
    for (let run = 0; run < 10; run += 1) {
      const result = await cleanupPostModerationLedger({ ...options, kinds })
      deletedVersions += result.deletedVersions
      clearedPassEvidence += result.clearedPassEvidence
      sawContinuation ||= result.hasMore
      sawOnlyPassEvidence ||=
        result.remainingKinds.length === 1 && result.remainingKinds[0] === 'pass_evidence'
      kinds = result.remainingKinds
      if (!result.hasMore) break
      if (run === 9) throw new Error('Post moderation retention did not finish within ten runs')
    }
    expect(sawContinuation).toBe(true)
    expect(sawOnlyPassEvidence).toBe(true)
    expect(deletedVersions).toBe(1)
    expect(clearedPassEvidence).toBe(1)
    const state = await getTestPostModerationRetentionState({
      versionIds: Object.values(versionIds),
      dispositionIds: [
        oldDispositionId,
        passAtBoundaryId,
        passJustNewerId,
        reviewId,
        staffId,
        staffRejectId,
        ...stalePassIds,
      ],
      attemptIds: [attemptId],
    })
    expect(state.versions).not.toContain(versionIds.eligibleOld)
    expect(state.versions).toEqual(
      expect.arrayContaining([
        versionIds.eligibleCurrent,
        versionIds.recentOld,
        versionIds.recentCurrent,
        versionIds.revertedOld,
        versionIds.revertedSuccessor,
        versionIds.noSuccessor,
      ]),
    )
    expect(state.attempts).toEqual([])
    expect(state.dispositions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: oldDispositionId })]),
    )
    expect(state.dispositions).toEqual(
      expect.arrayContaining([
        { id: passAtBoundaryId, disposition: 'pass', evidence: {} },
        { id: passJustNewerId, disposition: 'pass', evidence: { recent: true } },
        { id: reviewId, disposition: 'review', evidence: { preserve: true } },
        { id: staffId, disposition: 'pass', evidence: { staff: true } },
        { id: staffRejectId, disposition: 'reject', evidence: { reject: true } },
      ]),
    )
    for (const id of stalePassIds) {
      expect(state.dispositions).toContainEqual({
        id,
        disposition: 'pass',
        evidence: { no_successor: true },
      })
    }
  })
})
