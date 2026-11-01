import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  deleteOperationalRetainedReplayAnchorsForTest,
  hasTestRetainedIdentityRoot,
  insertOperationalRemoteActorForTest,
  insertOperationalRemoteActorIdentityOnlyForTest,
  deleteOperationalRemoteActorCacheForTest,
  insertOperationalRetainedReplayAnchorsForTest,
  insertTestRetainedIdentityRoot,
} from '@voucha/test-helpers'
import {
  deleteOperationalRetainedFollowReferenceForTest,
  deleteOperationalRetainedLikeReferenceForTest,
} from '@voucha/test-helpers/retained-replay-root-anchors'
import {
  readTestRetainedIdentityForeignKeys,
  type RetainedIdentityForeignKey,
} from '@voucha/test-helpers/entities/retained-identity-foreign-keys'
import { canStoreCopyrightNoticeCleanupCursorForTest } from '@voucha/test-helpers/entities/retained-identity-cleanup-cursor'
import { ROOT_FAMILIES } from '../retained-identity-root-references.mts'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'

type Registry = Record<string, { table: string; references: readonly (readonly string[])[] }>

/** Identity cleanup deletes a row only when every registered reference is absent. */
function unregisteredRetainedForeignKeys(
  foreignKeys: readonly RetainedIdentityForeignKey[],
  registry: Registry,
): string[] {
  const registered = new Map(
    Object.values(registry).map(family => [
      family.table,
      new Set(family.references.map(([table, column]) => `${table}.${column}`)),
    ]),
  )
  return foreignKeys
    .filter(({ target, owner, column }) => !registered.get(target)?.has(`${owner}.${column}`))
    .map(({ target, owner, column }) => `${owner}.${column} -> ${target}`)
}

describe('retained identity cleanup registry', () => {
  it('accepts the copyright notice family in cleanup cursors', async () => {
    expect(await canStoreCopyrightNoticeCleanupCursorForTest()).toBe(true)
  })

  it('lists every foreign key that targets a retained identity or classifier bridge', async () => {
    const foreignKeys = await readTestRetainedIdentityForeignKeys()
    expect(foreignKeys.length).toBeGreaterThan(0)
    expect(foreignKeys).toContainEqual({
      target: 'retained_user_identities',
      owner: 'post_clearance_changes',
      column: 'changed_by_id',
    })
    expect(foreignKeys).toContainEqual({
      target: 'retained_user_identities',
      owner: 'posts',
      column: 'clearance_changed_by_id',
    })
    for (const owner of ['post_clearance_changes', 'community_post_review_changes']) {
      expect(foreignKeys).toContainEqual({
        target: 'retained_user_identities',
        owner,
        column: 'post_author_user_id',
      })
    }
    expect(foreignKeys).toContainEqual({
      target: 'post_publication_community_identities',
      owner: 'classifier_runs',
      column: 'community_identity_id',
    })
    expect(foreignKeys).toContainEqual({
      target: 'retained_copyright_notice_identities',
      owner: 'copyright_notices',
      column: 'id',
    })
    expect(foreignKeys).toContainEqual({
      target: 'retained_copyright_notice_identities',
      owner: 'copyright_notice_party_identities',
      column: 'copyright_notice_id',
    })
    expect(foreignKeys).toContainEqual({
      target: 'retained_user_identities',
      owner: 'copyright_notice_party_identities',
      column: 'account_user_id',
    })
    expect(unregisteredRetainedForeignKeys(foreignKeys, ROOT_FAMILIES)).toEqual([])
  })

  it('reports a foreign key that root cleanup does not know about', () => {
    const stray = { target: 'retained_user_identities', owner: 'new_audit_rows', column: 'user_id' }
    expect(unregisteredRetainedForeignKeys([stray], ROOT_FAMILIES)).toEqual([
      'new_audit_rows.user_id -> retained_user_identities',
    ])
    const unknownRoot = { target: 'retained_widget_identities', owner: 'widgets', column: 'id' }
    expect(unregisteredRetainedForeignKeys([unknownRoot], ROOT_FAMILIES)).toEqual([
      'widgets.id -> retained_widget_identities',
    ])
  })

  it('fails when a registered reference is dropped from its family', async () => {
    const foreignKeys = await readTestRetainedIdentityForeignKeys()
    const { references, ...user } = ROOT_FAMILIES.user
    const withoutClearance = {
      ...ROOT_FAMILIES,
      user: {
        ...user,
        references: references.filter(([table]) => table !== 'post_clearance_changes'),
      },
    }
    expect(unregisteredRetainedForeignKeys(foreignKeys, withoutClearance)).toEqual([
      'post_clearance_changes.changed_by_id -> retained_user_identities',
      'post_clearance_changes.post_author_user_id -> retained_user_identities',
    ])
  })

  it('keeps deleted post and user roots while compact Like and Follow replay anchors remain', async () => {
    const postId = v7()
    const userId = v7()
    const anchors = await withCommittedPostgresTransactionForTest(async query => {
      await insertTestRetainedIdentityRoot('post', postId, { query })
      await insertTestRetainedIdentityRoot('user', userId, { query })
      return insertOperationalRetainedReplayAnchorsForTest(query, postId, userId)
    })
    try {
      await cleanupRetainedIdentityRoots(1_000, { post: [postId], user: [userId] })
      expect(await hasTestRetainedIdentityRoot('post', postId)).toBe(true)
      expect(await hasTestRetainedIdentityRoot('user', userId)).toBe(true)
    } finally {
      await withCommittedPostgresTransactionForTest(query =>
        deleteOperationalRetainedReplayAnchorsForTest(query, anchors),
      )
      await cleanupRetainedIdentityRoots(1_000, { post: [postId], user: [userId] })
    }
    expect(await hasTestRetainedIdentityRoot('post', postId)).toBe(false)
    expect(await hasTestRetainedIdentityRoot('user', userId)).toBe(false)
  })

  it('sweeps unreferenced remote actor identities after every live and replay reference ends', async () => {
    const postId = v7()
    const userId = v7()
    const { orphan, cached, anchors, likeOnly } = await withCommittedPostgresTransactionForTest(
      async query => {
        await insertTestRetainedIdentityRoot('post', postId, { query })
        await insertTestRetainedIdentityRoot('user', userId, { query })
        const likeOnly = await insertOperationalRetainedReplayAnchorsForTest(query, postId, userId)
        await deleteOperationalRetainedFollowReferenceForTest(query, likeOnly.followActivityId)
        return {
          orphan: await insertOperationalRemoteActorIdentityOnlyForTest(query),
          cached: await insertOperationalRemoteActorForTest(query, new Date()),
          anchors: await insertOperationalRetainedReplayAnchorsForTest(query, postId, userId),
          likeOnly,
        }
      },
    )
    const ids = [orphan.id, cached.id, anchors.actorIdentityId, likeOnly.actorIdentityId]
    try {
      expect(await cleanupRetainedIdentityRoots(1_000, { remote_actor: ids })).toEqual([
        { family: 'remote_actor', scanned: 4, deleted: 1, hasMore: false },
      ])
      expect(await hasTestRetainedIdentityRoot('remote_actor', orphan.id)).toBe(false)
      expect(await hasTestRetainedIdentityRoot('remote_actor', cached.id)).toBe(true)
      expect(await hasTestRetainedIdentityRoot('remote_actor', anchors.actorIdentityId)).toBe(true)
      expect(await hasTestRetainedIdentityRoot('remote_actor', likeOnly.actorIdentityId)).toBe(true)

      await withCommittedPostgresTransactionForTest(query =>
        deleteOperationalRetainedLikeReferenceForTest(query, anchors.likeActivityId),
      )
      expect(await cleanupRetainedIdentityRoots(1_000, { remote_actor: ids })).toMatchObject([
        { family: 'remote_actor', deleted: 0 },
      ])
      await withCommittedPostgresTransactionForTest(query =>
        deleteOperationalRetainedFollowReferenceForTest(query, anchors.followActivityId),
      )
      expect(await cleanupRetainedIdentityRoots(1_000, { remote_actor: ids })).toMatchObject([
        { family: 'remote_actor', deleted: 1 },
      ])
      expect(await hasTestRetainedIdentityRoot('remote_actor', likeOnly.actorIdentityId)).toBe(true)
      await withCommittedPostgresTransactionForTest(query =>
        deleteOperationalRemoteActorCacheForTest(query, cached.id),
      )
      await withCommittedPostgresTransactionForTest(query =>
        deleteOperationalRetainedLikeReferenceForTest(query, likeOnly.likeActivityId),
      )
      expect(await cleanupRetainedIdentityRoots(1_000, { remote_actor: ids })).toMatchObject([
        { family: 'remote_actor', deleted: 2 },
      ])
      expect(await hasTestRetainedIdentityRoot('remote_actor', cached.id)).toBe(false)
      expect(await hasTestRetainedIdentityRoot('remote_actor', anchors.actorIdentityId)).toBe(false)
      expect(await hasTestRetainedIdentityRoot('remote_actor', likeOnly.actorIdentityId)).toBe(
        false,
      )
    } finally {
      await withCommittedPostgresTransactionForTest(async query => {
        await deleteOperationalRetainedLikeReferenceForTest(query, anchors.likeActivityId)
        await deleteOperationalRetainedFollowReferenceForTest(query, anchors.followActivityId)
        await deleteOperationalRetainedLikeReferenceForTest(query, likeOnly.likeActivityId)
        await deleteOperationalRetainedFollowReferenceForTest(query, likeOnly.followActivityId)
        await deleteOperationalRemoteActorCacheForTest(query, cached.id)
      })
      await cleanupRetainedIdentityRoots(1_000, {
        remote_actor: ids,
        post: [postId],
        user: [userId],
      })
    }
  })
})
