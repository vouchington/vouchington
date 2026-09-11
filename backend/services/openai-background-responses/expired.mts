import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const BACKGROUND_RESPONSE_RECONCILE_BATCH_SIZE = 100

export interface ExpiredBackgroundResponse {
  responseId: string
  agentSlug: string
  communityId: string | null
  postId: string | null
  leaseToken: string
  leaseExpiresAt: Date
  createdAt: Date
}

interface ExpiredBackgroundResponseRow {
  response_id: string
  agent_slug: string
  community_id: string | null
  post_id: string | null
  lease_token: string
  lease_expires_at: Date
  created_at: Date
}

/** Expired ownership leases, ordered for deterministic bounded reconciliation. */
export async function getExpiredBackgroundResponses(
  options: { batchSize?: number } = {},
): Promise<ExpiredBackgroundResponse[]> {
  const batchSize = Math.min(
    Math.max(Math.trunc(options.batchSize ?? BACKGROUND_RESPONSE_RECONCILE_BATCH_SIZE), 1),
    BACKGROUND_RESPONSE_RECONCILE_BATCH_SIZE,
  )
  const { rows } = await write<ExpiredBackgroundResponseRow>(sql`/* getExpiredBackgroundResponses */
    SELECT
      response_id, agent_slug, community_id, post_id, lease_token, lease_expires_at, created_at
    FROM openai_background_responses
    WHERE lease_expires_at <= CURRENT_TIMESTAMP
    ORDER BY lease_expires_at ASC, response_id ASC
    LIMIT ${batchSize}
  `)
  return rows.map(row => ({
    responseId: row.response_id,
    agentSlug: row.agent_slug,
    communityId: row.community_id,
    postId: row.post_id,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    createdAt: row.created_at,
  }))
}
