import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type ProviderContextIdentity = {
  provider: 'stripe' | 'apple_app_store' | 'google_play' | 'microsoft_store'
  environment: 'test' | 'production'
  applicationId: string
}

/** Resolve the exact configured or provider-reported context inside the caller's transaction. */
export async function getOrCreateProviderContextId(
  context: ProviderContextIdentity,
  query: QueryExecutor,
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* getOrCreateProviderContextId */
    SELECT fn_upsert_membership_provider_context_id(
      ${context.provider}, ${context.environment}, ${context.applicationId}
    ) AS id`)
  if (!rows[0]) throw new Error('Membership provider context was not returned')
  return rows[0].id
}
