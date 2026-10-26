import { beginBoundedTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export interface BackgroundResponseRegistration {
  responseId: string
  agentSlug: string
  communityId?: string | null
  postId?: string | null
}

const REGISTRATION_CONNECTION_TIMEOUT_MS = 5_000
const REGISTRATION_STATEMENT_TIMEOUT_MS = 5_000

/** Records only responses created outside a GlideMQ job for age-based recovery. */
export async function registerBackgroundResponse(
  { responseId, agentSlug, communityId, postId }: BackgroundResponseRegistration,
  query: QueryExecutor = write,
): Promise<Date> {
  const { rows } = await query<{ created_at: Date }>(sql`/* registerBackgroundResponse */
    INSERT INTO openai_background_responses (response_id, agent_slug, community_id, post_id)
    VALUES (${responseId}, ${agentSlug}, ${communityId ?? null}, ${postId ?? null})
    ON CONFLICT (response_id) DO UPDATE SET response_id = EXCLUDED.response_id
    RETURNING created_at
  `)
  const row = rows[0]
  if (!row) throw new Error(`Background response registration returned no row: ${responseId}`)
  return row.created_at
}

export async function registerBackgroundResponseWithBoundedTransaction(
  registration: BackgroundResponseRegistration,
): Promise<Date> {
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: REGISTRATION_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: REGISTRATION_STATEMENT_TIMEOUT_MS,
  })
  const createdAt = await registerBackgroundResponse(registration, query)
  await query.commit()
  return createdAt
}
