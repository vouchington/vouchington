import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  hardDeleteTestPost,
  expireTestPostPublicationDirtyWorkLease,
  scrubTestUserUsernameInTransaction,
  enableQueryCapture,
  stopTestQueryCapture,
  type CapturedTestQuery,
} from '@voucha/test-helpers'
import {
  seedTestPublicationReceipt,
  readTestPublicationReceipt,
  readTestPublicationSnapshot,
  readTestPublicationRetainedKeys,
  insertTestPublicationTopicSlugFanout,
} from '@voucha/test-helpers/entities/post-publication-snapshots'
import {
  getTestPublicationCleanupTraversalBound,
  hasTestPublicationSnapshot,
  lockTestPublicationSnapshots,
  readTestPublicationSnapshotIds,
} from '@voucha/test-helpers/entities/post-publication-cleanup'
import { createTestPublicationSnapshotWork } from './test-fixtures.mts'
import { materializePostPublicationIdentitySnapshot } from './identity-snapshots.mts'
import {
  acknowledgePostPublicationDirtyWork,
  claimPostPublicationDirtyWork,
} from './dirty-work.mts'
import { acknowledgePostPublicationProjectionReceipts } from './receipts.mts'
import { cleanupPostPublicationIdentitySnapshots } from './snapshot-cleanup.mts'
import { reconcilePostPublicationDirtyWork } from './reconcile.mts'
import { recordPostPublicationChange } from './capture.mts'
import { insertTestPublicationSnapshotHeaderFanout } from '@voucha/test-helpers/entities/post-publication-query-plans'

describe('bounded publication receipt retention and reclamation', () => {
  it('bounds locked-header candidates and revisits skipped headers after wrap', async () => {
    const { work, candidate } = await createTestPublicationSnapshotWork()
    const ids = await insertTestPublicationSnapshotHeaderFanout({
      workId: work.id,
      generation: work.generation,
      postId: candidate.id,
      count: 20,
      abandoned: true,
    })
    await using lock = await beginTransaction()
    await lockTestPublicationSnapshots(lock, ids)
    const lockedBound = await getTestPublicationCleanupTraversalBound(10)
    for (let page = 0; page < lockedBound; page += 1) {
      const { result } = await captureCleanupCandidatePage()
      expect(result.scanned).toBeLessThanOrEqual(10)
      expect(result.snapshots).toBeLessThanOrEqual(10)
      expect(result.keys).toBeLessThanOrEqual(10)
    }
    expect(await readTestPublicationSnapshotIds(ids)).toEqual([...ids].sort())
    await lock.commit()
    const bound = await getTestPublicationCleanupTraversalBound(10)
    let remaining = ids
    for (let page = 0; page < bound && remaining.length > 0; page += 1) {
      await cleanupPostPublicationIdentitySnapshots(10)
      remaining = await readTestPublicationSnapshotIds(remaining)
    }
    expect(remaining).toEqual([])
  })
  it('keeps the accepted pointer during replacement and rejects sources changed before acceptance', async () => {
    const { work, candidate, user } = await createTestPublicationSnapshotWork()
    const first = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    candidate.identity_snapshot_id = first.snapshotId
    expect(await acknowledgePostPublicationProjectionReceipts(work, [candidate])).toBe(true)
    await using capture = await beginTransaction()
    const pending = await recordPostPublicationChange(capture, {
      scope: { type: 'post', postId: candidate.id },
      reason: 'post_updated',
    })
    await capture.commit()
    const replacement = await claimPostPublicationDirtyWork(pending, 120)
    if (!replacement) throw new Error('Expected replacement lease')
    const incomplete = await materializePostPublicationIdentitySnapshot(replacement, candidate, 1)
    expect(incomplete.complete).toBe(false)
    expect((await readTestPublicationReceipt(candidate.id))?.snapshotId).toBe(first.snapshotId)
    const complete = await materializePostPublicationIdentitySnapshot(replacement, candidate, 100)
    expect(complete.complete).toBe(true)
    candidate.identity_snapshot_id = complete.snapshotId
    await using mutation = await beginTransaction()
    await scrubTestUserUsernameInTransaction(mutation, user.id)
    await mutation.commit()
    expect(await acknowledgePostPublicationProjectionReceipts(replacement, [candidate])).toBe(false)
    expect((await readTestPublicationReceipt(candidate.id))?.snapshotId).toBe(first.snapshotId)
  })
  it('checkpoints one prior receipt page per attempt and resumes with a replacement lease', async () => {
    const { work, candidate } = await createTestPublicationSnapshotWork()
    const oldSlugs = Array.from(
      { length: 1001 },
      (_, index) => `prior-${candidate.id}-${index.toString().padStart(6, '0')}`,
    )
    await seedTestPublicationReceipt(candidate.id, 'previous-exact-snapshot', {
      topicIds: [],
      identityKeys: oldSlugs.map(value => ({ kind: 'post_slug', value })),
      sitemapTargets: [],
    })
    const first = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    expect(first.complete).toBe(false)
    expect((await readTestPublicationSnapshot(first.snapshotId)).keys).toHaveLength(0)
    expect(
      (await readTestPublicationRetainedKeys(work.id)).filter(key => oldSlugs.includes(key.value)),
    ).toHaveLength(100)
    await expireTestPostPublicationDirtyWorkLease(work.id)
    const replacement = await claimPostPublicationDirtyWork(work, 120)
    if (!replacement) throw new Error('Expected replacement lease')
    let result = first
    for (let page = 0; page < 20 && !result.complete; page += 1)
      result = await materializePostPublicationIdentitySnapshot(replacement, candidate, 100)
    expect(result).toEqual({ snapshotId: first.snapshotId, complete: true })
    expect(
      (await readTestPublicationRetainedKeys(work.id)).filter(key => oldSlugs.includes(key.value)),
    ).toHaveLength(1001)
    expect(await readTestPublicationReceipt(candidate.id)).toEqual({
      snapshotId: expect.any(String),
      fingerprint: 'previous-exact-snapshot',
    })
  })

  it('restarts changed receipt retention from origin without losing either prior set', async () => {
    const { work, candidate } = await createTestPublicationSnapshotWork()
    const old = ['a-old', 'b-old']
    const replacement = ['a-new', 'b-new']
    const identity = (values: string[]) => ({
      topicIds: [],
      identityKeys: values.map(value => ({ kind: 'post_slug' as const, value })),
      sitemapTargets: [],
    })
    await seedTestPublicationReceipt(candidate.id, 'first-version', identity(old))
    const first = await materializePostPublicationIdentitySnapshot(work, candidate, 2)
    expect(first.complete).toBe(false)
    await seedTestPublicationReceipt(candidate.id, 'replacement-version', identity(replacement))
    const restarted = await materializePostPublicationIdentitySnapshot(work, candidate, 2)
    expect(restarted).toEqual(first)
    const retained = (await readTestPublicationRetainedKeys(work.id)).map(key => key.value)
    expect(retained).toEqual(expect.arrayContaining([...old, ...replacement]))
    let result = restarted
    for (let page = 0; page < 10 && !result.complete; page += 1)
      result = await materializePostPublicationIdentitySnapshot(work, candidate, 2)
    expect(result.complete).toBe(true)
    expect((await readTestPublicationReceipt(candidate.id))?.fingerprint).toBe(
      'replacement-version',
    )
  })

  it('stages orphan receipt retention before exposing effects or deleting the receipt', async () => {
    const { work, candidate } = await createTestPublicationSnapshotWork()
    const oldSlugs = Array.from({ length: 201 }, (_, index) => `orphan-${candidate.id}-${index}`)
    await seedTestPublicationReceipt(candidate.id, 'orphan-prior', {
      topicIds: [],
      identityKeys: oldSlugs.map(value => ({ kind: 'post_slug', value })),
      sitemapTargets: [],
    })
    await hardDeleteTestPost(candidate.id)
    const first = await reconcilePostPublicationDirtyWork(work, 100)
    expect(first.hasIncompleteSnapshots).toBe(true)
    expect(first.identityKeys).toHaveLength(0)
    expect(
      (await readTestPublicationRetainedKeys(work.id)).filter(key => oldSlugs.includes(key.value)),
    ).toHaveLength(100)
    const second = await reconcilePostPublicationDirtyWork(work, 100)
    expect(second.hasIncompleteSnapshots).toBe(true)
    const third = await reconcilePostPublicationDirtyWork(work, 100)
    expect(third.hasIncompleteSnapshots).toBe(false)
    expect(third.hasMoreIdentityKeys).toBe(true)
    expect(
      (await readTestPublicationRetainedKeys(work.id)).filter(key => oldSlugs.includes(key.value)),
    ).toHaveLength(201)
    expect(await readTestPublicationReceipt(candidate.id)).toEqual({
      snapshotId: expect.any(String),
      fingerprint: 'orphan-prior',
    })
  })

  it('keeps accepted storage after dirty acknowledgement and caps stale key deletion', async () => {
    const { work, candidate, user } = await createTestPublicationSnapshotWork()
    const accepted = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    candidate.identity_snapshot_id = accepted.snapshotId
    expect(await acknowledgePostPublicationProjectionReceipts(work, [candidate])).toBe(true)
    expect(
      await acknowledgePostPublicationDirtyWork({
        id: work.id,
        generation: work.generation,
        leaseToken: work.lease_token,
      }),
    ).toBe(true)
    const before = await readTestPublicationSnapshot(accepted.snapshotId)
    expect((await cleanupPostPublicationIdentitySnapshots(1)).scanned).toBeLessThanOrEqual(1)
    expect(await readTestPublicationSnapshot(accepted.snapshotId)).toEqual(before)
    await insertTestPublicationTopicSlugFanout(candidate.id, user.id, 101)
    await using query = await beginTransaction()
    const pending = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: candidate.id },
      reason: 'post_updated',
    })
    await query.commit()
    const next = await claimPostPublicationDirtyWork(pending, 120)
    if (!next) throw new Error('Expected replacement generation')
    const stale = await materializePostPublicationIdentitySnapshot(next, candidate, 100)
    expect(stale.complete).toBe(false)
    expect((await readTestPublicationSnapshot(stale.snapshotId)).keys).toHaveLength(100)
    await using replacement = await beginTransaction()
    const currentPending = await recordPostPublicationChange(replacement, {
      scope: { type: 'post', postId: candidate.id },
      reason: 'post_updated',
    })
    await replacement.commit()
    const current = await claimPostPublicationDirtyWork(currentPending, 120)
    if (!current) throw new Error('Expected current generation')
    const incomplete = await materializePostPublicationIdentitySnapshot(current, candidate, 10)
    expect(incomplete.complete).toBe(false)
    await expireTestPostPublicationDirtyWorkLease(current.id)
    const traversalBound = await getTestPublicationCleanupTraversalBound(7)
    for (
      let page = 0;
      page < traversalBound && (await hasTestPublicationSnapshot(stale.snapshotId));
      page += 1
    ) {
      const reclaimed = await cleanupPostPublicationIdentitySnapshots(7)
      expect(reclaimed.keys).toBeLessThanOrEqual(7)
      expect(reclaimed.snapshots).toBeLessThanOrEqual(7)
      expect(reclaimed.scanned).toBeLessThanOrEqual(7)
    }
    expect(await hasTestPublicationSnapshot(stale.snapshotId)).toBe(false)
    expect(await hasTestPublicationSnapshot(incomplete.snapshotId)).toBe(true)
    const finalLease = await claimPostPublicationDirtyWork(currentPending, 120)
    if (!finalLease) throw new Error('Expected current lease')
    expect(
      await acknowledgePostPublicationDirtyWork({
        id: finalLease.id,
        generation: finalLease.generation,
        leaseToken: finalLease.lease_token,
      }),
    ).toBe(true)
    for (
      let page = 0;
      page < traversalBound && (await hasTestPublicationSnapshot(incomplete.snapshotId));
      page += 1
    )
      await cleanupPostPublicationIdentitySnapshots(7)
    expect(await hasTestPublicationSnapshot(incomplete.snapshotId)).toBe(false)
    expect(await readTestPublicationSnapshot(accepted.snapshotId)).toEqual(before)
  })
})

async function captureCleanupCandidatePage() {
  enableQueryCapture()
  let queries: CapturedTestQuery[] = []
  let result: Awaited<ReturnType<typeof cleanupPostPublicationIdentitySnapshots>>
  try {
    result = await cleanupPostPublicationIdentitySnapshots(10)
  } finally {
    queries = stopTestQueryCapture()
  }
  const page = queries.find(query =>
    query.text.startsWith('/* lockPublicationSnapshotCleanupHeaderPage */'),
  )?.values[0]
  if (!Array.isArray(page) || !page.every(value => typeof value === 'string'))
    throw new Error('Expected actual bounded cleanup candidate IDs')
  return { result, candidates: page as string[] }
}
