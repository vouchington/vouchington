import { describe, expect, it } from 'vitest'
import {
  createTestShadowAuditFixtures,
  insertAuditPost,
} from '@voucha/test-helpers/post-publication-shadow-audit-fixtures'
import { proveTestShadowAuditCommittedCheckpoint } from '@voucha/test-helpers/post-publication-shadow-audit-committed-checkpoint'

describe('post publication committed global checkpoint', () => {
  it('exposes an owned global checkpoint to another backend and restores the saved state under the production lock', async () => {
    const { user, postIds } = await createTestShadowAuditFixtures(3)
    for (const id of postIds)
      await insertAuditPost(
        user.id,
        id,
        `committed-shadow-${id}`,
        `Committed shadow ${id}`,
        'Real owned source for committed checkpoint visibility.',
      )
    const proof = await proveTestShadowAuditCommittedCheckpoint(postIds)
    expect(postIds).toContain(proof.checkpoint)
    expect(proof.observedCheckpoint).toBe(proof.checkpoint)
    expect(proof.distinctBackends).toBe(true)
  })
})
