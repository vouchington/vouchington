import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { tokenDigest } from './token-digest.mts'
import { decryptSecret } from '@modules/token-secrets'

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
      INNER JOIN membership_provider_contexts context ON context.id = token.membership_provider_context_id
      WHERE context.environment = ${options.environment} AND context.application_id = ${options.applicationId}
        AND token.purchase_token_lookup_sha256 = ${tokenDigest(options.purchaseToken)}
        AND context.provider = 'google_play' LIMIT 1`,
  )
  return rows[0] ?? null
}

export async function getLatestKnownGooglePlayPurchaseToken(options: {
  environment: 'test' | 'production'
  applicationId: string
  purchaseToken: string
}): Promise<string | null> {
  const digest = tokenDigest(options.purchaseToken)
  const { rows } = await write<{
    encrypted_purchase_token: Buffer
    purchase_token_lookup_sha256: string
  }>(sql`/* getLatestKnownGooglePlayPurchaseToken */
    SELECT latest.encrypted_purchase_token, latest.purchase_token_lookup_sha256
    FROM membership_google_play_purchase_tokens known
    INNER JOIN membership_google_play_purchase_tokens latest
      ON latest.membership_provider_lineage_id = known.membership_provider_lineage_id
      AND latest.membership_provider_context_id = known.membership_provider_context_id
    INNER JOIN membership_provider_contexts context ON context.id = known.membership_provider_context_id
    WHERE context.provider = 'google_play'
      AND context.environment = ${options.environment} AND context.application_id = ${options.applicationId}
      AND known.purchase_token_lookup_sha256 = ${digest}
      AND latest.fetched_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM membership_google_play_purchase_tokens successor
        WHERE successor.membership_provider_lineage_id = known.membership_provider_lineage_id
          AND successor.linked_purchase_token_id = latest.id
          AND successor.fetched_at IS NOT NULL
      )
    ORDER BY latest.id DESC LIMIT 1`)
  const latest = rows[0]
  return latest
    ? decryptSecret(
        latest.encrypted_purchase_token.toString(),
        `membership-google-play-token:${latest.purchase_token_lookup_sha256}`,
      )
    : null
}
