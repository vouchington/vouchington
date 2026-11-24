import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestExpiryWindow } from '@voucha/test-helpers'
import { cleanupOperationalTombstonePageForTest } from '@voucha/test-helpers/operational-retention-scopes'
import {
  deleteOperationalAttestationKeysForTest,
  insertOperationalAttestationKeyForTest,
  operationalRowExistsForTest,
  touchOperationalAttestationKeyForTest,
} from '@voucha/test-helpers/operational-tombstone-retention'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('operational tombstone lookahead', () => {
  it('reports a busy lookahead without claiming it as part of the current page', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 180 * DAY_MS)
    await using setup = await beginTransaction()
    const first = await insertOperationalAttestationKeyForTest(setup, {
      usedAt: window.firstEligibleDate,
    })
    const second = await insertOperationalAttestationKeyForTest(setup, {
      usedAt: window.secondEligibleDate,
    })
    await setup.commit()

    const options = { ids: [first, second], batchSize: 1, now }
    try {
      {
        await using holder = await beginTransaction()
        await touchOperationalAttestationKeyForTest(holder, second, now)
        await using page = await beginTransaction()
        expect(
          await cleanupOperationalTombstonePageForTest('app_attestation_keys', {
            ...options,
            borrowedQuery: page,
          }),
        ).toMatchObject({ deleted: 1, hasMore: true, continuation: { id: first } })
        expect(await operationalRowExistsForTest(page, 'app_attestation_keys', first)).toBe(false)
        expect(await operationalRowExistsForTest(page, 'app_attestation_keys', second)).toBe(true)
        await page.commit()
        await holder.rollback()
      }

      await using tail = await beginTransaction()
      expect(
        await cleanupOperationalTombstonePageForTest('app_attestation_keys', {
          ...options,
          borrowedQuery: tail,
        }),
      ).toMatchObject({ deleted: 1, hasMore: false, continuation: null })
      expect(await operationalRowExistsForTest(tail, 'app_attestation_keys', second)).toBe(false)
      await tail.commit()
    } finally {
      await using cleanup = await beginTransaction()
      await deleteOperationalAttestationKeysForTest(cleanup, options.ids)
      await cleanup.commit()
    }
  })
})
