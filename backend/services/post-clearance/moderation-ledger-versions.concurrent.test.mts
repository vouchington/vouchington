import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  getTestPostgresBackendProcessId,
  insertTestPost,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { createTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-waiter'
import {
  countTestPostModerationAttempts,
  getTestCurrentPostModerationVersion,
} from '@voucha/test-helpers/post-moderation-attempt-state'
import {
  commitCurrentPostModerationVersions,
  ensureCurrentPostModerationVersion,
} from './moderation-ledger-versions.mts'

async function createOwnedPost(): Promise<string> {
  const user = await createTestUser()
  const suffix = randomUUID()
  return insertTestPost({
    title: `Moderation version overlap ${suffix}`,
    slug: `moderation-version-${suffix}`,
    markdown: 'A current post for a moderation version race.',
    createdById: user.id,
    clearanceStatus: 'pending',
  })
}

describe('immutable moderation version conflict resolution', () => {
  it('returns the committed winner for an overlapping scalar ensure in the caller transaction', async () => {
    const postId = await createOwnedPost()
    await using holder = await beginTransaction()
    const winner = await ensureCurrentPostModerationVersion(postId, { query: holder })
    await using waiter = await createTestPostgresLockWaiter({
      holder,
      lock: { kind: 'transaction' },
      selected: {
        marker: '/* captureCurrentPostVersionKeys */',
        binding: { index: 0, value: [postId] },
      },
    })
    const waiting = ensureCurrentPostModerationVersion(postId, { query: waiter.query })
    await waiter.waitForLock(waiting)
    await holder.commit()
    const resolved = await waiting
    await waiter.query.commit()
    expect(resolved).toMatchObject({
      id: winner.id,
      post_id: postId,
      policy_revision: winner.policy_revision,
    })
    expect(resolved.content_sha256).toEqual(winner.content_sha256)
    expect(resolved.deadline_at).toEqual(winner.deadline_at)
    expect(await countTestPostModerationAttempts(postId)).toBe(2)
  })

  it('returns the conflict winner and fresh neighbor from an overlapping batch', async () => {
    const postId = await createOwnedPost()
    const neighborId = await createOwnedPost()
    await using holder = await beginTransaction()
    const winner = await ensureCurrentPostModerationVersion(postId, { query: holder })
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    const versions = await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'captureCurrentPostVersionKeys',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const pending = commitCurrentPostModerationVersions([postId, neighborId])
        await waitForLock(pending)
        await holder.commit()
        return pending
      },
    )
    expect(versions).toHaveLength(2)
    expect(versions.find(version => version.post_id === postId)).toMatchObject({ id: winner.id })
    expect(versions.find(version => version.post_id === postId)?.deadline_at).toEqual(
      winner.deadline_at,
    )
    expect(versions.find(version => version.post_id === neighborId)?.id).toBeDefined()
    expect(await countTestPostModerationAttempts(postId)).toBe(2)
    expect(await countTestPostModerationAttempts(neighborId)).toBe(2)
  })

  it('rolls back the version and attempts with a caller-owned transaction', async () => {
    const postId = await createOwnedPost()
    await using transaction = await beginTransaction()
    await ensureCurrentPostModerationVersion(postId, { query: transaction })
    await transaction.rollback()
    expect(await getTestCurrentPostModerationVersion(postId)).toBeNull()
    expect(await countTestPostModerationAttempts(postId)).toBe(0)
    const committed = await ensureCurrentPostModerationVersion(postId)
    expect(await getTestCurrentPostModerationVersion(postId)).toMatchObject({ id: committed.id })
    expect(await countTestPostModerationAttempts(postId)).toBe(2)
  })
})
