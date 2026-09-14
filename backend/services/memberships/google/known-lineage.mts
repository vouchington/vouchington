import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { tokenDigest } from './lineage.mts'

/** Identifies a durable token family and whether a signed-in direct proof now owns it. */
export async function getKnownGooglePlayTokenLineage(options: {
  environment: 'test' | 'production'
  applicationId: string
  purchaseToken: string
}): Promise<{ lineageId: string; hasDirectBinding: boolean } | null> {
  const { rows } = await write<{ lineageId: string; hasDirectBinding: boolean }>(
    sql`/* getKnownGooglePlayTokenLineage */
      SELECT lineage.id AS "lineageId", EXISTS (
        SELECT 1 FROM membership_lineage_bindings binding
        WHERE binding.membership_provider_lineage_id = lineage.id
          AND binding.source_kind = 'direct' AND binding.released_at IS NULL
      ) AS "hasDirectBinding"
      FROM membership_google_play_purchase_tokens token
      INNER JOIN membership_provider_lineages lineage ON lineage.id = token.membership_provider_lineage_id
      WHERE token.environment = ${options.environment} AND token.application_id = ${options.applicationId}
        AND token.purchase_token_lookup_sha256 = ${tokenDigest(options.purchaseToken)}
        AND lineage.provider = 'google_play' LIMIT 1`,
  )
  return rows[0] ?? null
}
