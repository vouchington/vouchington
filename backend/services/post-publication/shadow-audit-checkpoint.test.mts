import {
  observeGlobalShadowAuditCancellation,
  observeScopedShadowAuditSuccess,
} from '@voucha/test-helpers/post-publication-shadow-audit-contention'
import { getTestPostgresAdvisoryLockHolderProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { randomUUID } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import {
  createTestShadowAuditFixtures,
  insertAuditPost,
  withTestShadowAuditCheckpoint,
} from '@voucha/test-helpers/post-publication-shadow-audit-fixtures'
import { describe, expect, it } from 'vitest'
import {
  postPublicationShadowAuditLockKey,
  runPostPublicationShadowAudit,
} from './shadow-audit.mts'
import { postPublicationWorkMaxValues } from './work-limits.mts'

describe('post publication shadow audit checkpoints', () => {
  it('bounds both indexed audit sources before union materialization', async () => {
    let calls = 0
    const query: QueryExecutor = async () => {
      calls += 1
      throw new Error('Unexpected audit query')
    }
    // Input entries, not stored fixtures: rejecting the hard ceiling must admit no query.
    const postIdentityIds = Array<string>(
      postPublicationWorkMaxValues.shadow_audit_page_size + 1,
    ).fill(randomUUID())
    for (const dryRun of [true, false]) {
      await expect(
        runPostPublicationShadowAudit({ dryRun, postIdentityIds }, { query }),
      ).rejects.toThrow(
        'Post publication shadow audit selection exceeds its bounded source ceiling',
      )
    }
    expect(calls).toBe(0)
  })

  it('resets the durable checkpoint after the final partial repair page', async () => {
    const { user } = await createTestShadowAuditFixtures()
    await withTestShadowAuditCheckpoint(async context => {
      const terminal = await context.terminalPage(user.id)
      if (!terminal.before) throw new Error('Expected a nonempty global predecessor')
      await context.setCheckpoint(terminal.before)
      // A global short page containing both owned witnesses must reset the durable cursor.
      const result = await context.audit({ dryRun: false, limit: 3 })
      expect(result).toMatchObject({ hasMore: false, scannedByScope: { post: 2 } })
      expect(result.checkpoint).toBe(terminal.ids[1])
      await expect(context.getCheckpoint()).resolves.toBeNull()
      expect(terminal.maximum).toBe(terminal.ids[1])
      // Preserve explicit EOF coverage separately from the nonempty final page.
      await context.setCheckpoint(terminal.maximum)
      const eof = await context.audit({ dryRun: false, limit: 3 })
      expect(eof).toMatchObject({ checkpoint: null, scannedByScope: { post: 0 } })
      await expect(context.getCheckpoint()).resolves.toBeNull()
    })
  })

  it('keeps the global dry-run cursor compatible with a reserved finite repair selection', async () => {
    const { user, postIds, ids } = await createTestShadowAuditFixtures(2)
    const firstPostId = postIds[0]!
    const secondPostId = postIds[1]!
    for (const id of postIds) {
      await insertAuditPost(
        user.id,
        id,
        `shadow-global-${id}`,
        'Global cursor candidate',
        'Real indexed row for cursor interaction.',
      )
    }
    await withTestShadowAuditCheckpoint(async context => {
      const terminal = await context.terminalPage(user.id)
      await context.setCheckpoint(terminal.ids[1])
      const first = await context.audit({ dryRun: false, limit: 1, postIdentityIds: postIds })
      expect(first.checkpoint).toBe(firstPostId)
      await expect(context.hasRepair(firstPostId)).resolves.toBe(true)
      await expect(context.hasRepair(ids.foreignPostId)).resolves.toBe(false)
      await expect(context.getCheckpoint()).resolves.toBe(terminal.ids[1])
      const global = await context.audit({ dryRun: true, cursor: firstPostId, limit: 1 })
      expect(global.scannedByScope.post).toBe(1)
      if (!global.checkpoint) throw new Error('Expected global successor cursor')
      const advanced = global.checkpoint > firstPostId
      const boundedByKnownSuccessor = global.checkpoint <= secondPostId
      expect(advanced).toBe(true)
      expect(boundedByKnownSuccessor).toBe(true)
      await expect(context.getCheckpoint()).resolves.toBe(terminal.ids[1])
      const second = await context.audit({
        dryRun: false,
        limit: 1,
        cursor: first.checkpoint,
        postIdentityIds: postIds,
      })
      expect(second.checkpoint).toBe(secondPostId)
      const eof = await context.audit({
        dryRun: false,
        limit: 1,
        cursor: second.checkpoint,
        postIdentityIds: postIds,
      })
      expect(eof.scannedByScope.post).toBe(0)
      await expect(context.getCheckpoint()).resolves.toBe(terminal.ids[1])
    })
  })

  it('cancels a real global audit behind the reserved checkpoint and restores its session', async ({
    signal,
  }) => {
    await withTestShadowAuditCheckpoint(async context => {
      const before = await context.getCheckpoint()
      const holderPid = await getTestPostgresAdvisoryLockHolderProcessId({
        key: postPublicationShadowAuditLockKey,
      })
      const proof = await observeGlobalShadowAuditCancellation(holderPid, signal)
      expect(proof.contenderPid).not.toBe(proof.holderPid)
      expect(proof.timeoutMs).toBe(2000)
      expect(proof.failure).toMatchObject({ code: '57014' })
      expect(proof.restored).toBe(proof.baseline)
      await expect(context.getCheckpoint()).resolves.toBe(before)
    })
  })

  it('observes an actual owned repair wait and complete after its predecessor rolls back', async ({
    signal,
  }) => {
    const { user, postIds, ids } = await createTestShadowAuditFixtures()
    const postId = postIds[0]!
    await insertAuditPost(
      user.id,
      postId,
      `shadow-contended-${postId}`,
      'Contended native repair',
      'A real owned post awaiting its publication projection.',
    )
    await withTestShadowAuditCheckpoint(async context => {
      const checkpoint = await context.getCheckpoint()
      const foreignRepairBefore = await context.hasRepair(ids.foreignPostId)
      const ownedRepairBefore = await context.hasRepair(postId)
      const proof = await observeScopedShadowAuditSuccess(postId, signal)
      expect(proof.contenderPid).not.toBe(proof.holderPid)
      expect(proof.timeoutMs).toBe(2000)
      expect(proof.first).toMatchObject({ dryRun: false, scannedByScope: { post: 1 } })
      expect(proof.second).toMatchObject({
        dryRun: false,
        scannedByScope: { post: 1 },
        discrepanciesByScope: { post: 1 },
      })
      expect(proof.repair).toEqual({
        post_identity_id: postId,
        reasons: expect.arrayContaining(['post_updated']),
      })
      expect(proof.restored).toBe(proof.baseline)
      await expect(context.hasRepair(postId)).resolves.toBe(ownedRepairBefore)
      await expect(context.hasRepair(ids.foreignPostId)).resolves.toBe(foreignRepairBefore)
      await expect(context.getCheckpoint()).resolves.toBe(checkpoint)
    })
  })
})
