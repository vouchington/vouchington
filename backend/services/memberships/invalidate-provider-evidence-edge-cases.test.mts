import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { rejectMembershipProviderEvidence } from './invalidate-provider-evidence.mts'

describe('rejectMembershipProviderEvidence edge cases', () => {
  it('leaves an unknown evidence ID unchanged without creating entitlement effects', async () => {
    await expect(
      rejectMembershipProviderEvidence(
        randomUUID(),
        'Evidence does not have a projected membership source',
      ),
    ).resolves.toEqual({ invalidated: false, membershipId: null })
  })

  it.each([' ', '', 'x'.repeat(1001)])(
    'rejects an invalid rejection reason before changing evidence',
    async reason => {
      await expect(rejectMembershipProviderEvidence(randomUUID(), reason)).rejects.toThrow(
        'Rejection reason must be 1-1000 characters',
      )
    },
  )
})
