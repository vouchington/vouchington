import { describe, expect, it } from 'vitest'
import { beginTransaction, write } from '@data-stores/psql'
import { retainPublicationIdentityBridges } from './identity-bridges.mts'

describe('retainPublicationIdentityBridges', () => {
  it('retains one identity row when two transactions capture the same community id', async () => {
    const id = crypto.randomUUID()
    await using first = await beginTransaction()
    await using second = await beginTransaction()

    await retainPublicationIdentityBridges(first, 'community', [id])
    // The conflicting insert waits for the first transaction, then does nothing.
    const secondRetain = retainPublicationIdentityBridges(second, 'community', [id])
    await first.commit()
    await secondRetain
    await second.commit()

    const { rows } = await write<{ count: string }>(
      `/* identityBridgesTest:count */
       SELECT count(*)::text AS count FROM post_publication_community_identities WHERE id = $1`,
      [id],
    )
    expect(rows[0]?.count).toBe('1')
  })
})
