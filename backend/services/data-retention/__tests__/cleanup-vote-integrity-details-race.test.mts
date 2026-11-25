import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  createTestUserDirect,
  getTestVoteIntegrityFlagDetails,
  insertTestVoteIntegrityFlag,
} from '@voucha/test-helpers'
import {
  deleteTestVoteIntegrityFlagResolver,
  getTestVoteIntegrityFlagResolver,
  resolveTestVoteIntegrityFlag,
} from '@voucha/test-helpers/entities/vote-integrity'
import {
  getTestPostgresBackendProcessId,
  observeTestPostgresActionOrWait,
} from '@voucha/test-helpers/postgres-lock-wait'
import { createTestVoteRetentionPost } from '@voucha/test-helpers/vote-retention-post'
import { cleanupVoteIntegrityDetails } from '../cleanup-vote-integrity-details.mts'

describe('vote integrity detail retention', () => {
  it('redacts both flags after a concurrent resolver deletion', async () => {
    const { postId } = await createTestVoteRetentionPost()
    const resolver = await createTestUserDirect()
    const now = new Date('2026-10-23T12:00:00.000Z')
    const expired = Date.parse('2026-01-01T00:00:00.000Z')
    const details = { correlated_ips: ['203.0.113.1'], score: 3 }
    const held = await insertTestVoteIntegrityFlag({
      postId,
      id: v7({ msecs: expired }),
      flagType: 'ip_correlation',
      details,
    })
    const available = await insertTestVoteIntegrityFlag({
      postId,
      id: v7({ msecs: expired + 1 }),
      flagType: 'velocity_spike',
      details,
    })
    await resolveTestVoteIntegrityFlag(held, resolver.id)
    await using deletion = await beginTransaction()
    await deleteTestVoteIntegrityFlagResolver(deletion, resolver.id)

    const deletionPid = await getTestPostgresBackendProcessId(deletion)
    const cleanup = cleanupVoteIntegrityDetails(2, now, [held, available])
    await observeTestPostgresActionOrWait(deletionPid, 'redactVoteIntegrityFlagDetails', cleanup)
    await deletion.commit()
    const page = await cleanup

    expect(await getTestVoteIntegrityFlagDetails(held)).toEqual({ score: 3 })
    expect(await getTestVoteIntegrityFlagDetails(available)).toEqual({ score: 3 })
    expect(await getTestVoteIntegrityFlagResolver(held)).toBeNull()
    expect(page).toEqual({ scanned: 2, redacted: 2, hasMore: true })
    expect(await cleanupVoteIntegrityDetails(2, now, [held, available])).toEqual({
      scanned: 0,
      redacted: 0,
      hasMore: false,
    })
  })
})
