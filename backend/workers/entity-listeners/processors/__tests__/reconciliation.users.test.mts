import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  createTestUserWithAge,
  getFollowExists,
  readTestDatabaseTimestamp,
  setTestUserVoteWeightRecalculatedAt,
  setUserReferrerId,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { language_detection } from '@queues/language-detection/queues'
import { voteWeightQueue } from '@queues/vote-weight/queues'
import {
  streamEntityReconciliationCandidateBatches,
  type EntityReconciliationCandidate,
  type EntityReconciliationWindow,
} from '@services/entity-listener-reconciliation'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { reconcileEntity } from '../reconciliation.mts'

const TEN_MINUTES_MS = 600_000
const followRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  predicate: 'follow',
  objectType: 'user',
})

type AddQueue = { add: (...args: never[]) => Promise<unknown> }
type VoteWeightAddArgs = [name: string, data: { userId?: string }]

/**
 * Call-through tracker for fire-and-forget enqueues: the replay `void`s them, so a test settles
 * every started `add` before it reads the queue.
 */
function trackEnqueues() {
  const pending: Promise<unknown>[] = []
  const track = (queue: AddQueue) => {
    const original = queue.add as unknown as (...args: unknown[]) => Promise<unknown>
    return vi.spyOn(queue, 'add').mockImplementation(((...args: unknown[]) => {
      const enqueued = original.call(queue, ...args)
      pending.push(enqueued)
      return enqueued
    }) as never)
  }
  const voteWeightAdd = track(voteWeightQueue)
  track(language_detection)
  return {
    settle: () => Promise.all(pending),
    voteWeightEnqueuesFor: (userId: string) =>
      (voteWeightAdd.mock.calls as unknown as VoteWeightAddArgs[]).filter(
        ([name, data]) => name === 'processRecalculateUserVoteWeight' && data.userId === userId,
      ).length,
    resetVoteWeightCalls: () => voteWeightAdd.mockClear(),
  }
}

async function databaseNowMs(): Promise<number> {
  return new Date(await readTestDatabaseTimestamp()).getTime()
}

function windowBetween(now: number, startOffsetMs: number, endOffsetMs: number) {
  return { start: new Date(now + startOffsetMs), end: new Date(now + endOffsetMs) }
}

/** Resumes bounded runs so other tests' rows in the shared database cannot hide ours. */
async function* streamCompleteWindow(window: EntityReconciliationWindow) {
  let after: EntityReconciliationCandidate | undefined
  let hasMore = true
  const onComplete = (result: { hasMore: boolean }) => {
    hasMore = result.hasMore
  }
  while (hasMore) {
    hasMore = false
    for await (const batch of streamEntityReconciliationCandidateBatches(window, {
      after,
      onComplete,
    })) {
      after = batch.at(-1)
      yield batch
    }
  }
}

/** Replays this test's users through the real processors, as the hourly dispatcher does. */
async function reconcileUsers(
  window: EntityReconciliationWindow,
  users: PrivateUser[],
  settle: () => Promise<unknown>,
): Promise<EntityReconciliationCandidate[]> {
  const owned = new Set(users.map(user => user.id))
  const replayed: EntityReconciliationCandidate[] = []
  for await (const batch of streamCompleteWindow(window)) {
    for (const candidate of batch) {
      if (candidate.entityType !== 'user' || !owned.has(candidate.entityId)) continue
      await reconcileEntity(candidate)
      replayed.push(candidate)
    }
  }
  await settle()
  return replayed
}

async function hasVoteWeightJob(userId: string): Promise<boolean> {
  const jobs = await voteWeightQueue.searchJobs({
    name: 'processRecalculateUserVoteWeight',
    data: { userId },
  })
  return jobs.length > 0
}

async function hasLanguageDetectionJob(userId: string): Promise<boolean> {
  const jobs = await language_detection.searchJobs({ name: 'user', data: { id: userId } })
  return jobs.length > 0
}

async function createReferredUser(
  referrer: PrivateUser,
  create: () => Promise<PrivateUser>,
): Promise<PrivateUser> {
  const user = await create()
  await setUserReferrerId(user.id, referrer.id)
  return user
}

describe('entity-listener reconciliation of users', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not replay creation effects for a user that was only updated in the window', async () => {
    const enqueues = trackEnqueues()
    const referrer = await createTestUserDirect()
    // Created long before the window; the referrer write bumps updated_at into it.
    const updated = await createReferredUser(referrer, () => createTestUserWithAge(TEN_MINUTES_MS))
    const created = await createReferredUser(referrer, () => createTestUserDirect())

    const now = await databaseNowMs()
    const replayed = await reconcileUsers(
      windowBetween(now, -60_000, 60_000),
      [updated, created],
      enqueues.settle,
    )

    // The created sibling proves the replay ran and its enqueues landed before the absence checks.
    expect(replayed.map(candidate => candidate.entityId).toSorted()).toEqual(
      [updated.id, created.id].toSorted(),
    )
    expect(await hasVoteWeightJob(created.id)).toBe(true)
    expect(await getFollowExists(created.id, referrer.id)).toBe(true)

    expect(enqueues.voteWeightEnqueuesFor(updated.id)).toBe(0)
    expect(await hasVoteWeightJob(updated.id)).toBe(false)
    expect(await getFollowExists(updated.id, referrer.id)).toBe(false)
    // An update still refreshes the cache and language detection.
    expect(await hasLanguageDetectionJob(updated.id)).toBe(true)
  })

  it('replays vote weight and the referrer follow for a user created in the window', async () => {
    const enqueues = trackEnqueues()
    const referrer = await createTestUserDirect()
    const created = await createReferredUser(referrer, () => createTestUserDirect())

    const now = await databaseNowMs()
    await reconcileUsers(windowBetween(now, -60_000, 60_000), [created], enqueues.settle)

    expect(enqueues.voteWeightEnqueuesFor(created.id)).toBe(1)
    expect(await hasVoteWeightJob(created.id)).toBe(true)
    expect(await hasLanguageDetectionJob(created.id)).toBe(true)
    expect(await getFollowExists(created.id, referrer.id)).toBe(true)
  })

  it('keeps a referrer unfollowed when the replay reaches the user who unfollowed', async () => {
    const enqueues = trackEnqueues()
    const referrer = await createTestUserDirect()
    const unfollowed = await createReferredUser(referrer, () => createTestUserDirect())
    const sibling = await createReferredUser(referrer, () => createTestUserDirect())
    await upsertEntityRelation(unfollowed, followRelation, unfollowed, [referrer])
    await softDeleteEntityRelation(unfollowed, followRelation, unfollowed, [referrer])
    expect(await getFollowExists(unfollowed.id, referrer.id)).toBe(false)

    const now = await databaseNowMs()
    await reconcileUsers(
      windowBetween(now, -60_000, 60_000),
      [unfollowed, sibling],
      enqueues.settle,
    )

    // The sibling proves the auto-follow replay ran for users created in this window.
    expect(await getFollowExists(sibling.id, referrer.id)).toBe(true)
    expect(await getFollowExists(unfollowed.id, referrer.id)).toBe(false)
  })

  it('stops replaying a user once its vote-weight write-back re-enters the next window', async () => {
    const enqueues = trackEnqueues()
    const referrer = await createTestUserDirect()
    // Created a minute ago, so the first window holds its creation and the second window starts after.
    const user = await createReferredUser(referrer, () => createTestUserWithAge(60_000))
    const now = await databaseNowMs()

    await reconcileUsers(windowBetween(now, -120_000, 60_000), [user], enqueues.settle)
    expect(enqueues.voteWeightEnqueuesFor(user.id)).toBe(1)

    // The vote-weight worker's recalculated-at write rewrites users.updated_at, so the next
    // hourly window (checkpoint minus overlap) selects the user again, now after its creation.
    await setTestUserVoteWeightRecalculatedAt(user.id, new Date())
    enqueues.resetVoteWeightCalls()
    const nextWindow = windowBetween(now, -30_000, 60_000)
    const nextReplay = await reconcileUsers(nextWindow, [user], enqueues.settle)
    expect(nextReplay.map(candidate => candidate.entityId)).toEqual([user.id])
    expect(enqueues.voteWeightEnqueuesFor(user.id)).toBe(0)

    // Reconciling the same unchanged window again enqueues nothing new either.
    const repeatReplay = await reconcileUsers(nextWindow, [user], enqueues.settle)
    expect(repeatReplay.map(candidate => candidate.entityId)).toEqual([user.id])
    expect(enqueues.voteWeightEnqueuesFor(user.id)).toBe(0)
  })
})
