import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'

export type CommunityAgentModerationSummary = {
  id: string
  post_id: string
  community_prompt_id: string
  is_flagged: boolean
  created_at: Date
}

export async function searchCommunityAgentModerations(
  postId: string,
  communityId: string,
  options: { limit: number; after?: string },
): Promise<{ results: CommunityAgentModerationSummary[]; page_info: PageInfo }> {
  const scope = `community:${communityId.toLowerCase()}:post:${postId.toLowerCase()}:agent-moderations`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid moderation cursor').id
    : undefined
  // A result beyond a prompt's page cannot be in the merged page.
  // The scalar limit keeps the per-prompt index walk ordered in custom plans.
  const fetchLimit = options.limit + 1
  const statement = sql`/* searchCommunityAgentModerations */
    SELECT
      am.id,
      am.post_id,
      cap.id AS community_prompt_id,
      am.is_flagged,
      am.created_at
    FROM community_agent_prompts cap
    CROSS JOIN LATERAL (
      SELECT am.id, am.post_id, am.is_flagged, am.created_at
      FROM agent_moderations am
      WHERE am.post_id = ${postId}
        AND am.prompt_id = cap.id
        AND am.deleted_at IS NULL
  `
  if (afterId) statement.append(sql` AND am.id > ${afterId}::uuid`)
  statement.append(sql`
      ORDER BY am.id ASC LIMIT (SELECT ${fetchLimit}::bigint)
    ) am
    WHERE cap.community_id = ${communityId}
      AND cap.deleted_at IS NULL
    ORDER BY am.id ASC LIMIT ${fetchLimit}
  `)
  const { rows } = await read<CommunityAgentModerationSummary>(statement)
  const results = rows.slice(0, options.limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: rows.length > options.limit,
      getCursor: moderation => ({ id: moderation.id, scope }),
    }),
  }
}
