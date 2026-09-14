import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function makeTestGooglePlayVerificationDue(verificationId: string): Promise<void> {
  await write(sql`/* makeTestGooglePlayVerificationDue */
    UPDATE membership_verifications SET next_processing_at = CURRENT_TIMESTAMP
    WHERE id = ${verificationId}`)
}

export async function getTestGooglePlaySourceExpiredAt(userId: string): Promise<Date | null> {
  const { rows } = await write<{
    expired_at: Date | null
  }>(sql`/* getTestGooglePlaySourceExpiredAt */
    SELECT state.expired_at FROM membership_source_states state
    INNER JOIN membership_sources source ON source.id = state.membership_source_id
    INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    WHERE source.user_id = ${userId} AND lineage.provider = 'google_play'`)
  return rows[0]?.expired_at ?? null
}
