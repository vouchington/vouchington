import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestUser,
  scrubTestUserUsernameInTransaction,
  expireTestPostPublicationDirtyWorkLease,
  hardDeleteTestPost,
  setTestPostPublicationShadowAuditCheckpoint,
} from '@voucha/test-helpers'
import {
  insertTestPublicationTopicSlugFanout,
  insertTestPublicationFeedFanout,
  readTestPublicationSnapshot,
  seedTestPublicationReceipt,
  readTestPublicationReceipt,
  readTestPublicationRetainedKeys,
} from '@voucha/test-helpers/entities/post-publication-snapshots'
import { materializePostPublicationIdentitySnapshot } from './identity-snapshots.mts'
import { recordPostPublicationChange } from './capture.mts'
import {
  claimPostPublicationDirtyWork,
  acknowledgePostPublicationDirtyWork,
} from './dirty-work.mts'
import { listPublicationCandidates } from './publication-candidates.mts'
import { retainStoredPublicationIdentities } from './retain-stored-identities.mts'
import { acknowledgePostPublicationProjectionReceipts } from './receipts.mts'
import { runPostPublicationShadowAudit } from './shadow-audit.mts'
import { reconcilePostPublicationDirtyWork } from './reconcile.mts'
import { randomUUID } from 'node:crypto'

describe('bounded publication identity snapshots', () => {
  it('requires a completed snapshot receipt without an activation switch', async () => {
    const { work, candidate } = await createSnapshotWork()
    expect(await acknowledgePostPublicationProjectionReceipts(work, [candidate])).toBe(false)
    expect(await readTestPublicationReceipt(candidate.id)).toBeUndefined()
    const snapshot = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    expect(snapshot.complete).toBe(true)
    candidate.identity_snapshot_id = snapshot.snapshotId
    expect(await acknowledgePostPublicationProjectionReceipts(work, [candidate])).toBe(true)
    expect((await readTestPublicationReceipt(candidate.id))?.snapshotId).toBe(snapshot.snapshotId)
  })
  it('reuses the completed first post while the second post stages without advancing effects', async () => {
    const { candidate, user } = await createSnapshotWork()
    const second = await createTestPost({ user })
    await insertTestPublicationTopicSlugFanout(second.id, user.id, 51)
    await using query = await beginTransaction()
    const pending = await recordPostPublicationChange(query, {
      scope: { type: 'author', authorUserId: user.id },
      reason: 'post_updated',
    })
    await query.commit()
    const work = await claimPostPublicationDirtyWork(pending, 120)
    if (!work) throw new Error('Expected author snapshot lease')
    let page = await reconcilePostPublicationDirtyWork(work, 20)
    expect(page.hasIncompleteSnapshots).toBe(true)
    expect(page.topicIds).toHaveLength(0)
    expect(page.identityKeys).toHaveLength(0)
    const firstId = page.posts.find(post => post.id === candidate.id)?.identity_snapshot_id
    expect(firstId).toBeTypeOf('string')
    for (let attempt = 0; attempt < 10 && page.hasIncompleteSnapshots; attempt += 1) {
      page = await reconcilePostPublicationDirtyWork(work, 20)
      expect(page.posts.find(post => post.id === candidate.id)?.identity_snapshot_id).toBe(firstId)
    }
    expect(page.hasIncompleteSnapshots).toBe(false)
    expect(page.posts.map(post => post.id)).toEqual([candidate.id, second.id].sort())
    expect(page.posts.every(post => post.identity_snapshot_id !== undefined)).toBe(true)
  })
  it('pages actual 1001 topic, slug and feed sources with exact eventual membership', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected fanout author')
    const post = await createTestPost({ user })
    const fixtures = await insertTestPublicationTopicSlugFanout(post.id, user.id, 1001)
    const feedIds = await insertTestPublicationFeedFanout(post.id, user.id, fixtures.topicIds)
    await using query = await beginTransaction()
    const pending = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    await query.commit()
    const work = await claimPostPublicationDirtyWork(pending, 120)
    if (!work) throw new Error('Expected snapshot lease')
    const [candidate] = await listPublicationCandidates(work, 1, [post.id])
    if (!candidate) throw new Error('Expected snapshot candidate')
    let previousCount = 0
    let previousCursor: string | null = null
    let snapshotId: string | undefined
    let complete = false
    for (let page = 0; page < 40; page += 1) {
      const result = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
      snapshotId ??= result.snapshotId
      expect(result.snapshotId).toBe(snapshotId)
      const stored = await readTestPublicationSnapshot(snapshotId)
      expect(stored.keys.length - previousCount).toBeLessThanOrEqual(100)
      expect(stored.keys.length).toBeGreaterThanOrEqual(previousCount)
      expect(result.complete || stored.sourceCursor !== previousCursor).toBe(true)
      previousCursor = stored.sourceCursor
      previousCount = stored.keys.length
      complete = result.complete
      if (complete) break
    }
    expect(complete).toBe(true)
    const stored = await readTestPublicationSnapshot(snapshotId!)
    expect(
      stored.keys
        .filter(key => key.kind === 'topic')
        .map(key => key.value)
        .sort(),
    ).toEqual(fixtures.topicIds.sort())
    expect(stored.keys.filter(key => key.kind === 'post_slug').map(key => key.value)).toEqual(
      expect.arrayContaining(fixtures.slugs),
    )
    expect(
      stored.keys
        .filter(key => key.kind === 'rss_feed')
        .map(key => key.value)
        .sort(),
    ).toEqual(feedIds.sort())
    expect(await materializePostPublicationIdentitySnapshot(work, candidate, 100)).toEqual({
      snapshotId,
      complete: true,
    })
  })
  it('resumes interrupted pages and reuses a completed attempt', async () => {
    const { work, candidate } = await createSnapshotWork()
    const first = await materializePostPublicationIdentitySnapshot(work, candidate, 1)
    expect(first.complete).toBe(false)
    const initial = await readTestPublicationSnapshot(first.snapshotId)
    await expireTestPostPublicationDirtyWorkLease(work.id)
    const replacement = await claimPostPublicationDirtyWork(work, 120)
    if (!replacement) throw new Error('Expected replacement lease')
    let result = first
    for (let page = 0; page < 10 && !result.complete; page += 1)
      result = await materializePostPublicationIdentitySnapshot(replacement, candidate, 1)
    expect(result).toEqual({ snapshotId: first.snapshotId, complete: true })
    expect((await readTestPublicationSnapshot(result.snapshotId)).keys).toEqual(
      expect.arrayContaining(initial.keys),
    )
    expect(await materializePostPublicationIdentitySnapshot(replacement, candidate, 1)).toEqual(
      result,
    )
    await expect(materializePostPublicationIdentitySnapshot(work, candidate, 1)).rejects.toThrow(
      'current work lease',
    )
  })
  it('restarts after a source changes behind the cursor', async () => {
    const { work, candidate, user } = await createSnapshotWork()
    const first = await materializePostPublicationIdentitySnapshot(work, candidate, 2)
    await using mutation = await beginTransaction()
    await scrubTestUserUsernameInTransaction(mutation, user.id)
    await mutation.commit()
    let result = first
    for (let page = 0; page < 10; page += 1) {
      result = await materializePostPublicationIdentitySnapshot(work, candidate, 2)
      if ((await readTestPublicationSnapshot(first.snapshotId)).abandoned) break
    }
    expect(result.complete).toBe(false)
    expect((await readTestPublicationSnapshot(first.snapshotId)).abandoned).toBe(true)
    const next = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    expect(next.snapshotId).not.toBe(first.snapshotId)
    expect(next.complete).toBe(true)
    expect(
      (await readTestPublicationSnapshot(next.snapshotId)).keys.some(
        key => key.kind === 'author_username',
      ),
    ).toBe(false)
  })
  it('rejects a superseded generation without inserting stale rows', async () => {
    const { work, candidate } = await createSnapshotWork()
    const first = await materializePostPublicationIdentitySnapshot(work, candidate, 1)
    const previous = await readTestPublicationSnapshot(first.snapshotId)
    await using query = await beginTransaction()
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: candidate.id },
      reason: 'post_updated',
    })
    await query.commit()
    await expect(materializePostPublicationIdentitySnapshot(work, candidate, 100)).rejects.toThrow(
      'current work lease',
    )
    expect(await readTestPublicationSnapshot(first.snapshotId)).toEqual(previous)
  })
  it('retains previous receipt identities through hard deletion without JSON hydration', async () => {
    const { work, candidate } = await createSnapshotWork()
    const oldSlug = `old-${candidate.id}`
    await seedTestPublicationReceipt(candidate.id, 'previous-receipt', {
      topicIds: [],
      identityKeys: [{ kind: 'post_slug', value: oldSlug }],
      sitemapTargets: [],
    })
    await hardDeleteTestPost(candidate.id)
    await using query = await beginTransaction()
    await retainStoredPublicationIdentities(query, work.id, candidate.id)
    await query.commit()
    expect(await readTestPublicationRetainedKeys(work.id)).toContainEqual({
      kind: 'identity_post_slug',
      value: oldSlug,
    })
    expect(await readTestPublicationReceipt(candidate.id)).toEqual({
      snapshotId: expect.any(String),
      fingerprint: 'previous-receipt',
    })
  })
  it('detects and repairs exact relational audit discrepancies', async () => {
    const { work, candidate, user } = await createSnapshotWork()
    const snapshot = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    candidate.identity_snapshot_id = snapshot.snapshotId
    expect(await acknowledgePostPublicationProjectionReceipts(work, [candidate])).toBe(true)
    expect(
      await acknowledgePostPublicationDirtyWork({
        id: work.id,
        generation: work.generation,
        leaseToken: work.lease_token,
      }),
    ).toBe(true)
    const cursor = uuidBefore(candidate.id)
    const clean = await runPostPublicationShadowAudit({ dryRun: true, cursor, limit: 1 })
    expect(clean.discrepanciesByScope.post).toBe(0)
    await using mutation = await beginTransaction()
    await scrubTestUserUsernameInTransaction(mutation, user.id)
    await mutation.commit()
    expect(
      (await runPostPublicationShadowAudit({ dryRun: true, cursor, limit: 1 })).discrepanciesByScope
        .post,
    ).toBe(1)
    const checkpointName = `identity-audit-${randomUUID()}`
    await setTestPostPublicationShadowAuditCheckpoint(checkpointName, cursor)
    expect(
      (await runPostPublicationShadowAudit({ dryRun: false, checkpointName, limit: 1 }))
        .discrepanciesByScope.post,
    ).toBe(1)
    expect(await readTestPublicationReceipt(candidate.id)).toEqual({
      snapshotId: snapshot.snapshotId,
      fingerprint: candidate.eligibility_fingerprint,
    })
  })
})

async function createSnapshotWork() {
  const user = await createTestUser()
  if (!user) throw new Error('Expected snapshot user')
  const post = await createTestPost({ user })
  await using query = await beginTransaction()
  const pending = await recordPostPublicationChange(query, {
    scope: { type: 'post', postId: post.id },
    reason: 'post_updated',
  })
  await query.commit()
  const work = await claimPostPublicationDirtyWork(pending, 120)
  if (!work) throw new Error('Expected snapshot work')
  const [candidate] = await listPublicationCandidates(work, 1, [post.id])
  if (!candidate) throw new Error('Expected snapshot candidate')
  return { work, candidate, user }
}

function uuidBefore(id: string): string {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
