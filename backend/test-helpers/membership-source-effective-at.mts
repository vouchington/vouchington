import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestMembershipSourceEffectiveAt(sourceId: string, effectiveAt: string) {
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* setTestMembershipSourceEffectiveAt */
    UPDATE membership_source_states SET effective_at = ${effectiveAt}::timestamptz
    WHERE membership_source_id = ${sourceId}
    RETURNING effective_at`)
  await query.commit()
  return (rows[0] as { effective_at: Date }).effective_at
}
