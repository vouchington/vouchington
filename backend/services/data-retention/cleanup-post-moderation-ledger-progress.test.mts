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
  })

  it('does not page or lock posts for unchanged current versions on repeated passes', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const cutoff = createTestExpiryWindow().firstEligibleDate
    const oldAt = new Date(cutoff.getTime() - DAY_MS)
    const user = await createTestUser()
    const ownedPostIds: string[] = []
    for (let index = 0; index < 4; index += 1) {
      const postId = await insertTestPost({
        createdById: user.id,
        slug: `mod-retention-keeper-${randomUUID()}`,
        title: 'Current moderation keeper',
        markdown: 'body',
        clearanceStatus: 'pending',
      })
      ownedPostIds.push(postId)
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
      const lockedPostIds = queries
        .filter(query =>
          [
            'cleanupPostModerationLedgerPage.lockPagePosts',
            'lockChangedPostModerationRetentionPost',
          ].some(marker => query.text.includes(`/* ${marker} */`)),
        )
        .flatMap(query => query.values.flatMap(value => (Array.isArray(value) ? value : [value])))
      for (const postId of ownedPostIds) expect(lockedPostIds).not.toContain(postId)
    }
  })
})
