import { describe, expect, it } from 'vitest'
import { withTwoOpenTransactionsForTest } from '@voucha/test-helpers/two-open-transactions'
import { countTestPostPublicationCommunityIdentities } from '@voucha/test-helpers/post-publication-community-identity-count'
import { retainPublicationIdentityBridges } from './identity-bridges.mts'

describe('retainPublicationIdentityBridges', () => {
  it('retains one identity row when two transactions capture the same community id', async () => {
    const id = crypto.randomUUID()
    await withTwoOpenTransactionsForTest(async (first, second) => {
      await retainPublicationIdentityBridges(first, 'community', [id])
      // The conflicting insert waits for the first transaction, then does nothing.
      const secondRetain = retainPublicationIdentityBridges(second, 'community', [id])
      await first.commit()
      await secondRetain
      await second.commit()
    })

    expect(await countTestPostPublicationCommunityIdentities(id)).toBe('1')
  })
})
