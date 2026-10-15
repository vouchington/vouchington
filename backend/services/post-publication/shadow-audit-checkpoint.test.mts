import { readFileSync } from 'node:fs'
import {
  createTestShadowAuditFixtures,
  insertAuditPost,
  withTestShadowAuditCheckpoint,
} from '@voucha/test-helpers/post-publication-shadow-audit-fixtures'
import { describe, expect, it } from 'vitest'

const shadowAuditSource = readFileSync(new URL('./shadow-audit.mts', import.meta.url), 'utf8')

describe('post publication shadow audit checkpoints', () => {
  it('bounds both indexed audit sources before union materialization', () => {
    expect(shadowAuditSource).toContain(
      'SELECT id, id AS post_id FROM (SELECT id FROM posts WHERE (${postIdentityIds}::uuid[] IS NULL OR id = ANY(${postIdentityIds}::uuid[])) AND (${checkpoint}::uuid IS NULL OR id > ${checkpoint}::uuid) ORDER BY id LIMIT ${limit}) post_ids',
    )
    expect(shadowAuditSource).toContain(
      'SELECT receipt_ids.id, identity.post_id FROM (SELECT post_identity_id AS id FROM post_publication_projection_receipts WHERE (${postIdentityIds}::uuid[] IS NULL OR post_identity_id = ANY(${postIdentityIds}::uuid[])) AND (${checkpoint}::uuid IS NULL OR post_identity_id > ${checkpoint}::uuid) ORDER BY post_identity_id LIMIT ${limit}) receipt_ids JOIN post_publication_post_identities identity ON identity.id = receipt_ids.id',
    )
  })

  it('resets the durable checkpoint after the final partial repair page', async () => {
    const { user, postIds } = await createTestShadowAuditFixtures(2)
    for (const id of postIds) {
      await insertAuditPost(
        user.id,
        id,
        `shadow-partial-${id}`,
        'Final partial audit page',
        'Owned terminal-page row.',
      )
    }
    await withTestShadowAuditCheckpoint(async context => {
      const terminal = await context.terminalPage(user.id)
      await context.setCheckpoint(terminal.before)
      // The observed predecessor makes the next global row owned, without owning the global tail.
      const global = await context.audit({ dryRun: false, limit: 1 })
      expect(global.scannedByScope.post).toBe(1)
      expect(global.checkpoint).toBe(terminal.ids[0])
      await expect(context.getCheckpoint()).resolves.toBe(terminal.ids[0])
      const result = await context.audit({
        dryRun: false,
        limit: 100,
        postIdentityIds: terminal.ids,
      })
      expect(result).toMatchObject({ hasMore: false })
      expect(result.scannedByScope.post).toBeGreaterThanOrEqual(2)
      expect(result.scannedByScope.post).toBe(2)
      expect(result.checkpoint).toBe(terminal.ids[1])
      await expect(context.getCheckpoint()).resolves.toBe(terminal.ids[0])
      // Nonempty partial-page evidence is finite; global reset is proven at the real EOF.
      await context.setCheckpoint(terminal.maximum)
      const eof = await context.audit({ dryRun: false, limit: 100 })
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
})
