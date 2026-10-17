import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

// Sorts ahead of the public community names for the search prefix, but must be excluded.
export async function seedPrivateSearchCommunity(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData */ INSERT INTO communities
       (id, name, slug, created_by_id, created_via, visibility)
     VALUES ($1, 'A Seed Private Community', 'seed-private-explain-community', $2, 'system', 'private')
     ON CONFLICT DO NOTHING`,
    [seedUuid(5, '14'), seedUuid(0, '01')],
  )
  await transaction.commit()
}
