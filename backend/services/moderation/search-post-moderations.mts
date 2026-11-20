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
  is_flagged: boolean
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
    SELECT am.id, am.post_id, am.prompt_id, am.agent_id,
      encode(am.input_sha256, 'hex') AS input_sha256,
      am.is_flagged, am.results, am.created_at, am.updated_at,
      (SELECT agm.slug FROM moderator_agents agm WHERE agm.agent_id = am.agent_id LIMIT 1)
        AS moderator_slug
    FROM unnest(${[...new Set(postIds)]}::uuid[]) AS requested(post_id)
    CROSS JOIN LATERAL (
      SELECT id, post_id, prompt_id, agent_id, input_sha256,
        is_flagged, results, created_at, updated_at
      FROM agent_moderations
      WHERE post_id = requested.post_id AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ${MAX_MODERATIONS_PER_POST}
    ) am
    ORDER BY am.post_id, am.id DESC
  `)

  return rows as AgentModerationResult[]
}
