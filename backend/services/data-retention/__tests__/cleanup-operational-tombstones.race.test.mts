import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  insertOperationalAttestationKeyForTest,
  operationalRowExistsForTest,
  refreshOperationalAttestationKeyForTest,
} from '@voucha/test-helpers'
import { cleanupOperationalTombstonePageForTest } from '@voucha/test-helpers/operational-retention-scopes'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('operational tombstone retention concurrency', () => {
  it('keeps an attestation key refreshed after the delete picks it', async () => {
    const now = new Date()
    await using setup = await beginTransaction()
    const id = await insertOperationalAttestationKeyForTest(setup, {
      usedAt: new Date(now.getTime() - 181 * DAY_MS),
    })
    await setup.commit()

    await using refresh = await beginTransaction()
    await refreshOperationalAttestationKeyForTest(refresh, id, now)
    const result = await withTestOwnedPostgresWait(
      {
        holderProcessId: await getTestPostgresBackendProcessId(refresh),
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'deleteUnreferencedTombstonePage',
        releaseHolder: () => refresh[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const cleanup = (async () => {
          await using query = await beginTransaction()
          const page = await cleanupOperationalTombstonePageForTest('app_attestation_keys', {
            ids: [id],
            batchSize: 1,
            now,
            borrowedQuery: query,
          })
          await query.commit()
          return page
        })()
        await waitForLock(cleanup)
        await refresh.commit()
        return cleanup
      },
    )

    expect(result).toEqual({
      deleted: 0,
      hasMore: false,
      continuation: null,
      stalled: false,
    })
    await using read = await beginTransaction()
    expect(await operationalRowExistsForTest(read, 'app_attestation_keys', id)).toBe(true)
  })
})
