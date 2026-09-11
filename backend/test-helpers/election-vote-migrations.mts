import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getElectionVoteMigrationClaim(migrationId: string): Promise<string | null> {
  const { rows } = await write<{ migration_id: string }>(sql`/* getElectionVoteMigrationClaim */
    SELECT migration_id FROM election_vote_migration_claims WHERE migration_id = ${migrationId}
  `)
  return rows[0]?.migration_id ?? null
}
