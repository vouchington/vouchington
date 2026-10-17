import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityAgentPrompt } from './types.mts'

/**
 * The community's prompts the classifier may ask, in `activated_at, id` order. A classifier run
 * resolves them on its transaction (`query`) so the question set it pins is the one it locked.
 */
export async function getActiveCommunityAgentPrompts(
  communityId: string,
  query: QueryExecutor = read,
): Promise<CommunityAgentPrompt[]> {
  const { rows } = await query(
    sql`/* getActiveCommunityAgentPrompts */
    WITH relevant_creators AS MATERIALIZED (
      SELECT DISTINCT created_by_id
      FROM community_agent_prompts
      WHERE community_id = ${communityId}
        AND is_slot_allocated = true
        AND activated_at IS NOT NULL
        AND deactivated_at IS NULL
        AND deleted_at IS NULL
    ), relevant_memberships AS MATERIALIZED (
      SELECT creator.created_by_id, membership.id
      FROM relevant_creators creator
      JOIN LATERAL (
        SELECT id FROM memberships
        WHERE user_id = creator.created_by_id AND projection_ended_at IS NULL
        LIMIT 1
      ) membership ON true
    ), eligible_prompts AS (
    SELECT
      cap.id,
      cap.community_id,
      cap.created_by_id,
      cap.is_slot_allocated,
      cap.activated_at,
      cap.deactivated_at,
      cap.deleted_at,
      cap.deleted_by_id,
      vm.plan,
      ap.agent_id,
      ap.prompt,
      ap.model_name,
      ap.model_provider,
      ap.created_at,
      ap.updated_at
    FROM community_agent_prompts cap
    JOIN relevant_memberships membership ON membership.created_by_id = cap.created_by_id
    JOIN agent_prompts ap ON ap.id = cap.id
    JOIN LATERAL (
      SELECT plan, status FROM view_memberships
      WHERE id = membership.id
      LIMIT 1
    ) vm ON true
    WHERE cap.is_slot_allocated = true
      AND cap.activated_at IS NOT NULL
      AND cap.deactivated_at IS NULL
      AND cap.deleted_at IS NULL
      AND ap.deleted_at IS NULL
      AND vm.status IN ('active', 'past_due')
      AND vm.plan IN ('plus', 'pro')
    ), ranked_prompts AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY created_by_id ORDER BY activated_at, id) AS membership_slot
      FROM eligible_prompts
    )
    SELECT * FROM ranked_prompts
    WHERE community_id = ${communityId}
      AND membership_slot <= CASE plan WHEN 'plus' THEN 3 WHEN 'pro' THEN 10 END
    ORDER BY activated_at, id
    `,
  )
  return rows as CommunityAgentPrompt[]
}
