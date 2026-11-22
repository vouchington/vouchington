import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  acquirePostModerationLedgerRetentionTestLock,
  createTestExpiryWindow,
  createTestUser,
  getTestPostModerationRetentionState,
  insertTestPost,
  insertTestPostModerationDispositionAt,
  insertTestPostModerationVersionAt,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import { cleanupPostModerationLedger } from './cleanup-post-moderation-ledger.mts'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'

const DAY_MS = 86_400_000

describe('post moderation ledger progress', () => {
  it('restarts pass evidence pagination when the lower bound rises', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const user = await createTestUser()
    const postId = await insertTestPost({
      createdById: user.id,
      slug: `mod-retention-bound-${randomUUID()}`,
      title: 'Pass evidence lower bound',
      markdown: 'body',
      clearanceStatus: 'pending',
    })
    const digest = randomBytes(32)
    await setPostLLMModerationContentSha256(postId, digest)
    const versionId = uuidv7({ msecs: at(96).getTime() })
    await insertTestPostModerationVersionAt({
      id: versionId,
      postId,
      contentSha256: digest,
      policyRevision: POST_MODERATION_POLICY_REVISION,
    })
    const dispositionIds = [95, 94, 93].map(days => uuidv7({ msecs: at(days).getTime() }))
    for (const id of dispositionIds) {
      await insertTestPostModerationDispositionAt({
        id,
        versionId,
        source: 'openai_omni',
        disposition: 'pass',
        evidence: { retained: true },
      })
    }
    const options = {
      postIds: [postId],
      now,
      lowerBoundDate,
      retentionDays: 90,
      batchSize: 1,
      maxBatches: 1,
      kinds: ['pass_evidence'] as const,
    }
    expect((await cleanupPostModerationLedger(options)).clearedPassEvidence).toBe(1)
    await cleanupPostModerationLedger({
      ...options,
      lowerBoundDate: at(93),
      batchSize: 3,
    })
    const state = await getTestPostModerationRetentionState({
      versionIds: [versionId],
      dispositionIds,
    })
    expect(state.dispositions.map(disposition => disposition.evidence)).toEqual([
      {},
      { retained: true },
      {},
    ])
    const anotherPostId = await insertTestPost({
      createdById: user.id,
      slug: `mod-retention-included-${randomUUID()}`,
      title: 'Included pass evidence',
      markdown: 'body',
      clearanceStatus: 'pending',
    })
    await setPostLLMModerationContentSha256(anotherPostId, digest)
    const anotherVersionId = uuidv7({ msecs: at(96).getTime() })
    const excludedPostId = await insertTestPost({
      createdById: user.id,
      slug: `mod-retention-excluded-${randomUUID()}`,
      title: 'Excluded pass evidence',
      markdown: 'body',
      clearanceStatus: 'pending',
    })
    await setPostLLMModerationContentSha256(excludedPostId, digest)
    const excludedVersionId = uuidv7({ msecs: at(96).getTime() })
    const anotherDispositionId = uuidv7({ msecs: at(92).getTime() })
    const excludedDispositionId = uuidv7({ msecs: at(92).getTime() })
    for (const [id, ownerPostId] of [
      [anotherVersionId, anotherPostId],
      [excludedVersionId, excludedPostId],
    ] as const) {
      await insertTestPostModerationVersionAt({
        id,
        postId: ownerPostId,
        contentSha256: digest,
        policyRevision: POST_MODERATION_POLICY_REVISION,
      })
    }
    for (const [id, ownerVersionId] of [
      [anotherDispositionId, anotherVersionId],
      [excludedDispositionId, excludedVersionId],
    ] as const) {
      await insertTestPostModerationDispositionAt({
        id,
        versionId: ownerVersionId,
        source: 'openai_omni',
        disposition: 'pass',
        evidence: { retained: true },
      })
    }
    await cleanupPostModerationLedger({
      ...options,
      postIds: [postId, anotherPostId],
      lowerBoundDate: at(93),
      batchSize: 3,
    })
    const targeted = await getTestPostModerationRetentionState({
      versionIds: [anotherVersionId, excludedVersionId],
      dispositionIds: [anotherDispositionId, excludedDispositionId],
    })
    expect(targeted.dispositions.find(row => row.id === anotherDispositionId)?.evidence).toEqual({})
    expect(targeted.dispositions.find(row => row.id === excludedDispositionId)?.evidence).toEqual({
      retained: true,
    })
  })

  it('keeps unchanged current versions on repeated bounded passes', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const cutoff = createTestExpiryWindow().firstEligibleDate
    const oldAt = new Date(cutoff.getTime() - DAY_MS)
    const user = await createTestUser()
    for (let index = 0; index < 4; index += 1) {
      const postId = await insertTestPost({
        createdById: user.id,
        slug: `mod-retention-keeper-${randomUUID()}`,
        title: 'Current moderation keeper',
        markdown: 'body',
        clearanceStatus: 'pending',
      })
      const digest = randomBytes(32)
      await setPostLLMModerationContentSha256(postId, digest)
      await insertTestPostModerationVersionAt({
        id: uuidv7({ msecs: oldAt.getTime(), seq: index + 1 }),
        postId,
        contentSha256: digest,
        policyRevision: POST_MODERATION_POLICY_REVISION,
      })
    }
    const options = {
      kinds: ['superseded_versions'] as const,
      batchSize: 1,
      maxBatches: 1,
      retentionDays: 90,
      now: new Date(cutoff.getTime() + 90 * DAY_MS),
      lowerBoundDate: new Date(oldAt.getTime() - 1),
    }
    for (let pass = 0; pass < 2; pass += 1) {
      const { result, queries } = await withCapturedTestQueries(() =>
        cleanupPostModerationLedger(options),
      )
      expect(result.deletedVersions).toBe(0)
      expect(
        countCapturedQueriesByAnnotation(queries, 'cleanupPostModerationLedgerPage.listVersions'),
      ).toBe(1)
    }
  })
})
