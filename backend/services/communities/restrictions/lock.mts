import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'

/** Serialize active restriction-set changes with delegated community contribution decisions. */
export async function lockCommunityRestrictionWrites(
  query: TransactionQuery,
  communityId: string,
): Promise<void> {
  const { rows } = await query<{ id: string }>(sql`/* lockCommunityRestrictionWrites */
    SELECT id FROM communities
    WHERE id = ${communityId} AND deleted_at IS NULL
    FOR NO KEY UPDATE`)
  assert(rows[0], 404, 'Community not found')
}
