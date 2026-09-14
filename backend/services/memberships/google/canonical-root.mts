import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getKnownGooglePlayCanonicalRoot(
  environment: 'test' | 'production',
  applicationId: string,
  digest: string,
): Promise<string | null> {
  const { rows } = await write<{ provider_lineage_id: string }>(
    sql`/* getKnownGooglePlayCanonicalRoot */
      SELECT lineage.provider_lineage_id FROM membership_google_play_purchase_tokens token
      INNER JOIN membership_provider_lineages lineage ON lineage.id = token.membership_provider_lineage_id
      WHERE token.environment = ${environment} AND token.application_id = ${applicationId}
        AND token.purchase_token_lookup_sha256 = ${digest} AND lineage.provider = 'google_play' LIMIT 1`,
  )
  return rows[0]?.provider_lineage_id ?? null
}
