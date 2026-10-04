import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

/** Inserts the immutable grant clock at birth, preserving ledger immutability. */
export async function createTestHistoricalQueuedGrant(userId: string, productId: string) {
  const id = v7({ msecs: new Date('2019-01-01T00:00:00Z').getTime() })
  await write(sql`/* createTestHistoricalQueuedGrant */
    WITH source AS (
      INSERT INTO membership_sources (user_id, source_kind)
      VALUES (${userId}, 'admin_grant') RETURNING id
    ), state AS (
      INSERT INTO membership_source_states (
        membership_source_id, source_kind, membership_product_id, effective_at
      ) SELECT id, 'admin_grant', ${productId}, '2019-01-01T00:00:00Z' FROM source
    ) INSERT INTO membership_grants (
      id, membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot
    ) SELECT ${id}, id, ${userId}, ${productId}, 1, 'historical test grant' FROM source`)
  return id
}
