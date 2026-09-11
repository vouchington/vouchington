import { randomUUID } from 'node:crypto'
import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ExpiredBackgroundResponse } from './expired.mts'

export const BACKGROUND_RESPONSE_SWEEPER_LEASE_DURATION_MS = 2 * 60_000

/**
 * Finalizes a lease only while the caller still owns its exact fencing token and reports whether
 * a row was actually removed. Only a caller that receives
 * `true` may write to ai_usage_records for this response id -- this is what stops the
 * normal-completion path (backend/agents/_shared/record-response-usage.mts) and the sweeper
 * reconciler (reconcile.mts, below) from both recording the same response when they race, e.g. a
 * sweeper retrieve() resolving at the same moment the original call finally returns.
 */
export async function deleteBackgroundResponseRegistration(
  responseId: string,
  leaseToken: string,
  query: QueryExecutor = write,
): Promise<boolean> {
  const result = await query(sql`/* deleteBackgroundResponseRegistration */
    DELETE FROM openai_background_responses
    WHERE response_id = ${responseId}
      AND lease_token = ${leaseToken}
    RETURNING response_id
  `)
  return result.rows.length > 0
}

export async function claimExpiredBackgroundResponse(
  candidate: ExpiredBackgroundResponse,
  query: QueryExecutor = write,
): Promise<ExpiredBackgroundResponse | null> {
  const sweeperToken = randomUUID()
  const { rows } = await query<{
    response_id: string
    agent_slug: string
    community_id: string | null
    post_id: string | null
    lease_token: string
    lease_expires_at: Date
    created_at: Date
  }>(sql`/* claimExpiredBackgroundResponse */
    UPDATE openai_background_responses
    SET lease_token = ${sweeperToken},
        lease_expires_at =
          CURRENT_TIMESTAMP + (
            ${BACKGROUND_RESPONSE_SWEEPER_LEASE_DURATION_MS} * INTERVAL '1 millisecond'
          )
    WHERE response_id = ${candidate.responseId}
      AND lease_token = ${candidate.leaseToken}
      AND lease_expires_at <= CURRENT_TIMESTAMP
    RETURNING
      response_id, agent_slug, community_id, post_id, lease_token, lease_expires_at, created_at
  `)
  const row = rows[0]
  return row
    ? {
        responseId: row.response_id,
        agentSlug: row.agent_slug,
        communityId: row.community_id,
        postId: row.post_id,
        leaseToken: row.lease_token,
        leaseExpiresAt: row.lease_expires_at,
        createdAt: row.created_at,
      }
    : null
}
