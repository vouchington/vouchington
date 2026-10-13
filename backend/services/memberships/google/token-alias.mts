import { encryptSecret } from '@modules/token-secrets'
import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { tokenDigest } from './token-digest.mts'

export class GooglePlayLineageConflictError extends Error {
  constructor() {
    super('Google Play purchase token belongs to another canonical lineage')
    this.name = 'GooglePlayLineageConflictError'
  }
}

export async function ensureGooglePlayTokenAlias(
  token: string,
  contextId: string,
  lineageId: string,
  query: QueryExecutor,
): Promise<{ id: string; fetchedAt: Date | null }> {
  const digest = tokenDigest(token)
  const encrypted = Buffer.from(encryptSecret(token, `membership-google-play-token:${digest}`))
  const { rows: inserted } = await query<{ id: string }>(sql`/* ensureGooglePlayTokenAlias */
    INSERT INTO membership_google_play_purchase_tokens (
      membership_provider_context_id, purchase_token_lookup_sha256,
      encrypted_purchase_token, membership_provider_lineage_id
    ) VALUES (${contextId}, ${digest}, ${encrypted}, ${lineageId})
    ON CONFLICT (membership_provider_context_id, purchase_token_lookup_sha256) DO NOTHING
    RETURNING id`)
  if (inserted[0]) return { id: inserted[0].id, fetchedAt: null }
  const { rows: existing } = await query<{
    id: string
    membership_provider_lineage_id: string
    fetched_at: Date | null
  }>(sql`/* getGooglePlayTokenAliasForUpdate */
    SELECT id, membership_provider_lineage_id, fetched_at FROM membership_google_play_purchase_tokens
    WHERE membership_provider_context_id = ${contextId} AND purchase_token_lookup_sha256 = ${digest}
    FOR UPDATE`)
  if (existing[0]?.membership_provider_lineage_id !== lineageId)
    throw new GooglePlayLineageConflictError()
  return { id: existing[0].id, fetchedAt: existing[0].fetched_at }
}
