import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModerationStoredResults } from './results.mts'

const MAX_MODERATIONS_PER_POST = 10

export type AgentModerationResult = {
  id: string
  post_id: string
  prompt_id: string
  agent_id: string
  moderator_slug: string | null
  flagged: boolean
  results: AgentModerationStoredResults
  input_sha256: string
  created_at: Date
  updated_at: Date
}

export async function searchPostModerationsByPostIds(
  postIds: string[],
): Promise<AgentModerationResult[]> {
  if (postIds.length === 0) return []

  const { rows } = await read(sql`/* searchPostModerationsByPostIds */
    WITH ranked AS (
      SELECT
        am.id,
        am.post_id,
        am.prompt_id,
        am.agent_id,
        encode(am.input_sha256, 'hex') AS input_sha256,
        am.flagged,
        am.results,
        am.created_at,
        am.updated_at,
        agm.slug AS moderator_slug,
        ROW_NUMBER() OVER (PARTITION BY am.post_id ORDER BY am.created_at DESC) AS rn
      FROM agent_moderations am
      LEFT JOIN agents__moderators agm ON agm.agent_id = am.agent_id
      WHERE am.post_id = ANY(${postIds}::uuid[])
        AND am.deleted_at IS NULL
    )
    SELECT id, post_id, prompt_id, agent_id, input_sha256, flagged, results, created_at, updated_at, moderator_slug
    FROM ranked
    WHERE rn <= ${MAX_MODERATIONS_PER_POST}
    ORDER BY post_id, created_at DESC
  `)

  return rows as AgentModerationResult[]
}

export async function searchPostModerationsByAgent(
  postId: string,
  agentId: string,
  options?: { limit?: number; after?: { id: string } },
): Promise<{
  results: AgentModerationResult[]
  hasNextPage: boolean
}> {
  const limit = options?.limit ?? 10

  const query = sql`/* searchPostModerationsByAgent */
    SELECT
      am.id,
      am.post_id,
      am.prompt_id,
      am.agent_id,
      encode(am.input_sha256, 'hex') AS input_sha256,
      am.flagged,
      am.results,
      am.created_at,
      am.updated_at,
      agm.slug AS moderator_slug
    FROM agent_moderations am
    LEFT JOIN agents__moderators agm ON agm.agent_id = am.agent_id
    WHERE am.post_id = ${postId}
      AND am.agent_id = ${agentId}
      AND am.deleted_at IS NULL
  `
  if (options?.after) {
    query.append(sql` AND am.id < ${options.after.id}`)
  }
  query.append(sql` ORDER BY am.id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)

  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit) as AgentModerationResult[]

  return { results, hasNextPage }
}
