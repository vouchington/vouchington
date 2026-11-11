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
  const statement = sql`/* searchCommunityAgentModerations */
    SELECT
      am.id,
      am.post_id,
      am.prompt_id AS community_prompt_id,
      am.is_flagged,
      am.created_at
    FROM agent_moderations am
    JOIN community_agent_prompts cap ON cap.id = am.prompt_id
    WHERE am.post_id = ${postId}
      AND cap.community_id = ${communityId}
      AND cap.deleted_at IS NULL
      AND am.deleted_at IS NULL
  `
  if (afterId) statement.append(sql` AND am.id > ${afterId}::uuid`)
  statement.append(sql` ORDER BY am.id ASC LIMIT ${options.limit + 1}`)
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
