import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import {
  getHistoryTablesWithoutMutationGuards,
  getHistoryActorContracts,
  getMediaAuthorityProgressColumns,
} from '../../../test-helpers/data-stores/psql/schema-history-contracts.mts'

describe('history storage contracts', () => {
  afterAll(onGracefulShutdown)

  it('guards every current revision and change ledger against mutation', async () => {
    const rows = await getHistoryTablesWithoutMutationGuards()
    expect(rows).toEqual([])
  })

  it('retains change actors and erases only revision author links', async () => {
    const rows = await getHistoryActorContracts()
    expect(rows.filter(row => row.actor_column === 'changed_by_id')).toHaveLength(9)
    expect(rows.filter(row => row.actor_column === 'revised_by_id')).toHaveLength(4)
    expect(
      rows
        .filter(row => row.actor_column === 'changed_by_id')
        .every(
          row => row.target === 'retained_user_identities' && row.deletion === 'r' && row.ensured,
        ),
    ).toBe(true)
    expect(
      rows
        .filter(row => row.actor_column === 'revised_by_id')
        .every(row => row.target === 'users' && row.deletion === 'n'),
    ).toBe(true)
  })

  it('keeps mutable workflow progress off the media authority parent', async () => {
    const rows = await getMediaAuthorityProgressColumns()
    expect(rows).toEqual([])
  })
})
