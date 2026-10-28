import { describe, expect, it } from 'vitest'
import { assertTestOwnedPostgresWait } from '../../test-helpers/postgres-client-lock-identity.mts'
import { withTestPostgresLockWitness } from '../../test-helpers/postgres-lock-witness.mts'

describe('owned PostgreSQL lock witness', () => {
  it('accepts the exact queued operation and diagnoses a wrong query or holder and a released wait', async () => {
    await withTestPostgresLockWitness(async input => {
      const { observer, waiterProcessId, holderProcessId, queryMarker } = input
      await expect(
        assertTestOwnedPostgresWait(observer, waiterProcessId, holderProcessId, queryMarker),
      ).resolves.toBeUndefined()
      await expect(
        assertTestOwnedPostgresWait(observer, waiterProcessId, holderProcessId, 'wrong-query'),
      ).rejects.toMatchObject({
        cause: {
          expected: { waiterProcessId, holderProcessId, queryMarker: 'wrong-query' },
          observed: {
            database_matches: true,
            state: 'active',
            query_matches: false,
            lock_queued: true,
            blocking_process_ids: [holderProcessId],
          },
        },
      })
      await expect(
        assertTestOwnedPostgresWait(observer, waiterProcessId, waiterProcessId, queryMarker),
      ).rejects.toMatchObject({
        cause: {
          expected: { holderProcessId: waiterProcessId },
          observed: { query_matches: true, blocking_process_ids: [holderProcessId] },
        },
      })
      await input.releaseHolder()
      await expect(
        assertTestOwnedPostgresWait(observer, waiterProcessId, holderProcessId, queryMarker),
      ).rejects.toMatchObject({
        cause: { observed: { state: 'idle', lock_queued: false, blocking_process_ids: [] } },
      })
    })
  })
})
