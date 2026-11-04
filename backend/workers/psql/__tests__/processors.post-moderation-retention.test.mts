import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { psql } from '@queues/psql/queues'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import {
  acquirePostModerationLedgerRetentionTestLock,
  getTestPostModerationRetentionState,
} from '@voucha/test-helpers'
import {
  blockPostModerationRetentionFixtureVersions,
  enqueuePostModerationRetentionFixtureWork,
  reservePostModerationRetentionPolicyCursor,
  setPostModerationRetentionPolicyCursor,
  createPostModerationRetentionContinuationFixture,
  setPostModerationRetentionSentinelDueAt,
} from '@voucha/test-helpers/post-moderation-retention-continuation'
import {
  getTestPostModerationVersionMarkers,
  getTestPostModerationPostWork,
  getTestPostModerationPolicyRevisionCursor,
} from '@voucha/test-helpers/post-moderation-retention-progress'
import processPsql from '../processors.mts'

describe('post moderation retention continuation', () => {
  it('continues only unfinished post moderation ledger streams', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const restoreCursor = await reservePostModerationRetentionPolicyCursor()
    onTestFinished(restoreCursor)
    const fixture = await createPostModerationRetentionContinuationFixture()
    const neighborBefore = await getTestPostModerationRetentionState(fixture.neighbor)
    const neighborMarkers = await getTestPostModerationVersionMarkers(
      fixture.neighbor.versionIds[0]!,
    )
    const options = {
      retention: {
        families: ['postModerationLedger'] as const,
        postModerationLedger: {
          postIds: [fixture.owned.postId],
          now: fixture.now,
          lowerBoundDate: fixture.lowerBoundDate,
          batchSize: 1,
          maxBatches: 1,
        },
      },
    }
    const initial = await processPsql('dataRetentionCleanup', {}, undefined, initialJobId, options)
    expect(initial).toMatchObject({
      postModerationLedger: {
        deletedVersions: 1,
        clearedPassEvidence: 1,
        hasMore: true,
        remainingKinds: ['superseded_versions', 'pass_evidence'],
      },
    })
    const first = await psql.getJob(ids[0]!)
    expect((first!.data as PsqlRetentionJobData).continuation?.activePostModerationKinds).toEqual([
      'superseded_versions',
      'pass_evidence',
    ])
    const secondResult = await processPsql(
      'dataRetentionCleanup',
      first?.data as PsqlRetentionJobData,
      undefined,
      first!.id,
      options,
    )
    expect(secondResult).toMatchObject({
      postModerationLedger: {
        deletedVersions: 1,
        clearedPassEvidence: 1,
        hasMore: true,
        remainingKinds: ['pass_evidence'],
      },
    })
    const second = await psql.getJob(ids[1]!)
    expect((second!.data as PsqlRetentionJobData).continuation?.activePostModerationKinds).toEqual([
      'pass_evidence',
    ])
    await setPostModerationRetentionSentinelDueAt(fixture.sentinelId, fixture.at(100))
    const sentinelBefore = await getTestPostModerationVersionMarkers(fixture.sentinelId)
    const thirdResult = await processPsql(
      'dataRetentionCleanup',
      second?.data as PsqlRetentionJobData,
      undefined,
      second!.id,
      options,
    )
    expect(thirdResult).toMatchObject({
      postModerationLedger: {
        deletedVersions: 0,
        clearedPassEvidence: 1,
        hasMore: false,
        remainingKinds: [],
      },
    })
    expect(await getTestPostModerationVersionMarkers(fixture.sentinelId)).toEqual(sentinelBefore)
    expect(await getTestPostModerationRetentionState(fixture.neighbor)).toEqual(neighborBefore)
    expect(await getTestPostModerationVersionMarkers(fixture.neighbor.versionIds[0]!)).toEqual(
      neighborMarkers,
    )
    const state = await getTestPostModerationRetentionState(fixture.owned)
    expect(state.dispositions.map(row => row.evidence)).toEqual([{}, {}, {}])
    expect(await psql.getJob(ids[2]!)).toBeNull()
  })
  it('scopes policy rechecks and hash work to owned posts', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const restoreCursor = await reservePostModerationRetentionPolicyCursor()
    onTestFinished(restoreCursor)
    const fixture = await createPostModerationRetentionContinuationFixture()
    const cleanupNeighborWork = await enqueuePostModerationRetentionFixtureWork(
      fixture.neighbor.postId,
    )
    onTestFinished(cleanupNeighborWork)
    const neighborWorkBefore = await getTestPostModerationPostWork(fixture.neighbor.postId)
    expect(neighborWorkBefore).not.toBeNull()
    const oldIds = fixture.owned.versionIds.slice(0, 2)
    await blockPostModerationRetentionFixtureVersions([...oldIds, fixture.neighbor.versionIds[0]!])
    const neighborBefore = await getTestPostModerationVersionMarkers(
      fixture.neighbor.versionIds[0]!,
    )
    const options = {
      retention: {
        families: ['postModerationLedger'] as const,
        postModerationLedger: {
          postIds: [fixture.owned.postId],
          now: fixture.now,
          lowerBoundDate: fixture.lowerBoundDate,
          batchSize: 1,
          maxBatches: 1,
          kinds: ['superseded_versions'] as const,
        },
      },
    }
    const initialJobId = `policy-retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    await setPostModerationRetentionPolicyCursor(null)
    const initialized = await processPsql('dataRetentionCleanup', {}, undefined, undefined, options)
    expect(initialized).toMatchObject({
      postModerationLedger: { deletedVersions: 0, hasMore: false },
    })
    expect(await getTestPostModerationPostWork(fixture.neighbor.postId)).toEqual(neighborWorkBefore)
    expect((await getTestPostModerationPolicyRevisionCursor())?.observedRevision).not.toBeNull()
    await setPostModerationRetentionPolicyCursor('test-policy-before-current')
    const queued = await processPsql('dataRetentionCleanup', {}, undefined, initialJobId, {
      retention: {
        ...options.retention,
        postModerationLedger: {
          ...options.retention.postModerationLedger,
          batchSize: 2,
        },
      },
    })
    expect(queued).toMatchObject({ postModerationLedger: { deletedVersions: 0, hasMore: true } })
    expect(await getTestPostModerationPostWork(fixture.owned.postId)).not.toBeNull()
    expect(await getTestPostModerationPostWork(fixture.neighbor.postId)).toEqual(neighborWorkBefore)
    const first = await psql.getJob(ids[0]!)
    const advanced = await processPsql(
      'dataRetentionCleanup',
      first!.data as PsqlRetentionJobData,
      undefined,
      first!.id,
      options,
    )
    expect(advanced).toMatchObject({ postModerationLedger: { deletedVersions: 1, hasMore: true } })
    expect((await getTestPostModerationPostWork(fixture.owned.postId))?.cursorVersionId).toBe(
      oldIds[0],
    )
    const second = await psql.getJob(ids[1]!)
    const finished = await processPsql(
      'dataRetentionCleanup',
      second!.data as PsqlRetentionJobData,
      undefined,
      second!.id,
      options,
    )
    expect(finished).toMatchObject({ postModerationLedger: { deletedVersions: 1, hasMore: false } })
    expect(await getTestPostModerationPostWork(fixture.owned.postId)).toBeNull()
    expect(await getTestPostModerationVersionMarkers(fixture.neighbor.versionIds[0]!)).toEqual(
      neighborBefore,
    )
    expect(await getTestPostModerationPostWork(fixture.neighbor.postId)).toEqual(neighborWorkBefore)
  })
})
