import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityAgentPrompt } from './types.mts'

export async function getCommunityAgentPrompt(
  promptId: string,
): Promise<CommunityAgentPrompt | null> {
  const { rows } = await read(
    sql`/* getCommunityAgentPrompt */
    SELECT
      cap.id,
      cap.community_id,
      cap.created_by_id,
      cap.is_slot_allocated,
      cap.activated_at,
      cap.deactivated_at,
      cap.deleted_at,
      cap.deleted_by_id,
      ap.agent_id,
      ap.prompt,
      ap.model_name,
      ap.model_provider,
      ap.created_at,
      ap.updated_at
    FROM community_agent_prompts cap
    JOIN agent_prompts ap ON ap.id = cap.id
    WHERE cap.id = ${promptId}
      AND cap.deleted_at IS NULL
      AND ap.deleted_at IS NULL
    LIMIT 1
    `,
  )
  return (rows[0] as CommunityAgentPrompt) ?? null
}

export async function searchCommunityAgentPrompts(
  communityId: string,
  options: { limit?: number; after?: string } = {},
): Promise<{ results: CommunityAgentPrompt[]; page_info: PageInfo }> {
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(100, Math.trunc(options.limit!)))
    : 25
  const scope = `community:${communityId.toLowerCase()}:agent-prompts`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const statement = sql`/* searchCommunityAgentPrompts */
    SELECT
      cap.id,
      cap.community_id,
      cap.created_by_id,
      cap.is_slot_allocated,
      cap.activated_at,
      cap.deactivated_at,
      cap.deleted_at,
      cap.deleted_by_id,
      ap.agent_id,
      ap.prompt,
      ap.model_name,
      ap.model_provider,
      ap.created_at,
      ap.updated_at
    FROM community_agent_prompts cap
    JOIN LATERAL (
      SELECT agent_id, prompt, model_name, model_provider, created_at, updated_at
      FROM agent_prompts
      WHERE id = cap.id AND deleted_at IS NULL
      LIMIT 1
    ) ap ON true
    WHERE cap.community_id = ${communityId}
      AND cap.deleted_at IS NULL
    `
  if (afterId)
    statement.append(sql`AND (cap.community_id, cap.id) < (${communityId}::uuid, ${afterId}::uuid)`)
  statement.append(sql` ORDER BY cap.id DESC LIMIT ${limit + 1}`)
  const { rows } = await read<CommunityAgentPrompt>(statement)
  const results = rows.slice(0, limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: rows.length > limit,
      getCursor: prompt => ({ id: prompt.id, scope }),
    }),
  }
}
