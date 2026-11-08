import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestMembershipChangeReferences(changeId: string): Promise<
  | {
      membership_source_id: string | null
      membership_grant_id: string | null
    }
  | undefined
> {
  const { rows } = await read<{
    membership_source_id: string | null
    membership_grant_id: string | null
  }>(sql`/* getTestMembershipChangeReferences */
    SELECT membership_source_id, membership_grant_id
    FROM membership_changes WHERE id = ${changeId}`)
  return rows[0]
}
