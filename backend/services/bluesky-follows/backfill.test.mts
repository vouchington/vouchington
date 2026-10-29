import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  insertTestBlueskyLinkedAccount,
  insertTestLocalFollow,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  insertTestBlueskyFollowReceipt,
  requestTestBlueskyDisconnect,
} from '@voucha/test-helpers/entities/bluesky-linked-accounts'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { listBlueskyFollowPropagationCandidatePage } from './backfill.mts'
import { blueskyFollowsWorkConfig } from './work-limits.mts'

type BlueskyFollowPropagationCandidate = Awaited<
  ReturnType<typeof listBlueskyFollowPropagationCandidatePage>
>['candidates'][number]

const START_OF_IDS = '00000000-0000-0000-0000-000000000000'

describe('listBlueskyFollowPropagationCandidatePage', () => {
  it('bounds the initial candidate page without a cursor', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 1 }),
    )
    const [follower, firstFollowee, secondFollowee] = await Promise.all(
      [1, 2, 3].map(() => createTestUserDirect()),
    )
    await Promise.all(
      [follower!, firstFollowee!, secondFollowee!].map(user =>
        insertTestBlueskyLinkedAccount({ userId: user.id }),
      ),
    )
    await Promise.all([
      insertTestLocalFollow(follower!.id, firstFollowee!.id),
      insertTestLocalFollow(follower!.id, secondFollowee!.id),
    ])

    const first = await listBlueskyFollowPropagationCandidatePage()
    expect(first.candidates).toHaveLength(1)
    expect(first.hasMore).toBe(true)
  })

  it('pages candidate pairs by pair order, never over the page size, covering each once', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 2 }),
    )
    const users = await Promise.all([1, 2, 3].map(() => createTestUserDirect()))
    await Promise.all(users.map(user => insertTestBlueskyLinkedAccount({ userId: user.id })))
    await Promise.all(
      users.map((user, index) => insertTestLocalFollow(user.id, users[(index + 1) % 3]!.id)),
    )
    const own = new Set(users.map((user, index) => pairKey(user.id, users[(index + 1) % 3]!.id)))
    const firstOwnId = users.map(user => user.id).toSorted()[0]!

    const seen: BlueskyFollowPropagationCandidate[] = []
    let after: BlueskyFollowPropagationCandidate | undefined = {
      followerUserId: uuidBefore(firstOwnId),
      followeeUserId: START_OF_IDS,
    }
    for (;;) {
      const page = await listBlueskyFollowPropagationCandidatePage(after)
      expect(page.candidates.length).toBeLessThanOrEqual(2)
      expect(page.hasMore).toBe(page.candidates.length === 2)
      seen.push(...page.candidates)
      if (!page.hasMore || own.size === seen.filter(pair => own.has(keyOf(pair))).length) break
      after = page.candidates.at(-1)
    }

    const keys = seen.map(keyOf)
    expect(keys).toEqual(keys.toSorted())
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(keys.filter(key => own.has(key)))).toEqual(own)
  })

  it('stops after the last candidate pair', async () => {
    const page = await listBlueskyFollowPropagationCandidatePage({
      followerUserId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      followeeUserId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    })
    expect(page).toEqual({ candidates: [], hasMore: false })
  })

  it('unions owned follow and receipt-only pairs, then excludes a disconnected account', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 2 }),
    )
    const [follower, receiptFollowee, relationFollowee] = await Promise.all(
      [1, 2, 3].map(() => createTestUserDirect()),
    )
    const followerAccount = await insertTestBlueskyLinkedAccount({ userId: follower!.id })
    await Promise.all([
      insertTestBlueskyLinkedAccount({ userId: receiptFollowee!.id }),
      insertTestBlueskyLinkedAccount({ userId: relationFollowee!.id }),
    ])
    await insertTestBlueskyFollowReceipt(follower!.id, receiptFollowee!.id)
    await insertTestLocalFollow(follower!.id, relationFollowee!.id)
    const after = {
      followerUserId: uuidBefore(follower!.id),
      followeeUserId: START_OF_IDS,
    }

    const first = await listBlueskyFollowPropagationCandidatePage(after)
    expect(first.candidates.map(keyOf).toSorted()).toEqual(
      [
        pairKey(follower!.id, receiptFollowee!.id),
        pairKey(follower!.id, relationFollowee!.id),
      ].toSorted(),
    )

    await requestTestBlueskyDisconnect(followerAccount.bluesky_did)
    const disconnected = await listBlueskyFollowPropagationCandidatePage(after)
    expect(disconnected.candidates.some(pair => pair.followerUserId === follower!.id)).toBe(false)
  })
})

function pairKey(followerUserId: string, followeeUserId: string): string {
  return `${followerUserId}__${followeeUserId}`
}

function keyOf(pair: BlueskyFollowPropagationCandidate): string {
  return pairKey(pair.followerUserId, pair.followeeUserId)
}
