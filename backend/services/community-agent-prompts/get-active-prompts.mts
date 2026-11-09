import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityAgentPrompt } from './types.mts'

export type ActiveCommunityAgentPromptCursor = { activatedAt: string; id: string }
export type ActiveCommunityAgentPromptPage = {
  items: (CommunityAgentPrompt & { activation_cursor: string })[]
  /** Position after the last scanned prompt, including prompts rejected by membership checks. */
  next: ActiveCommunityAgentPromptCursor | null
}

/**
 * Reads one bounded page of active candidates in activation order. The cursor advances over every
 * candidate, including a prompt whose owner is no longer paid, so an ineligible stretch never
 * hides a later eligible rule. The creator-wide rank probe is bounded by the ten-slot invariant.
 */
export async function getActiveCommunityAgentPromptPage(
  communityId: string,
  after: ActiveCommunityAgentPromptCursor | null,
  limit: number,
  query: QueryExecutor = read,
  through: ActiveCommunityAgentPromptCursor | null = null,
): Promise<ActiveCommunityAgentPromptPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    throw new Error('active community prompt page limit must be between 1 and 30')
  }
  const statement = sql`
    /* getActiveCommunityAgentPromptPage */
    WITH candidates AS MATERIALIZED (
      SELECT id, community_id, created_by_id, is_slot_allocated, activated_at,
        deactivated_at, deleted_at, deleted_by_id
      FROM community_agent_prompts
      WHERE community_id = ${communityId}
        AND is_slot_allocated = true
        AND activated_at IS NOT NULL
        AND deactivated_at IS NULL
        AND deleted_at IS NULL`
  if (after)
    statement.append(sql`
        AND (activated_at, id) > (${after.activatedAt}::timestamptz, ${after.id}::uuid)`)
  if (through)
    statement.append(sql`
        AND (activated_at, id) <= (${through.activatedAt}::timestamptz, ${through.id}::uuid)`)
  statement.append(sql`
      ORDER BY activated_at, id
      LIMIT ${limit + 1}
    )
    SELECT cap.id, cap.community_id, cap.created_by_id, cap.is_slot_allocated,
      cap.activated_at, cap.deactivated_at, cap.deleted_at, cap.deleted_by_id,
      ap.agent_id, ap.prompt, ap.model_name, ap.model_provider, ap.created_at, ap.updated_at,
      to_char(cap.activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        AS activation_cursor,
      (ap.deleted_at IS NULL AND vm.status IN ('active', 'past_due')
        AND vm.plan IN ('plus', 'pro')
        AND creator_rank.position <= CASE vm.plan WHEN 'plus' THEN 3 WHEN 'pro' THEN 10 END
      ) AS eligible
    FROM candidates cap
    JOIN agent_prompts ap ON ap.id = cap.id
    LEFT JOIN LATERAL (
      SELECT membership.id FROM memberships membership
      WHERE membership.user_id = cap.created_by_id AND membership.projection_ended_at IS NULL
      LIMIT 1
    ) membership ON true
    LEFT JOIN LATERAL (
      SELECT plan, status FROM view_memberships
      WHERE id = membership.id
      LIMIT 1
    ) vm ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS position FROM (
        SELECT 1 FROM community_agent_prompts prior
        JOIN agent_prompts prior_prompt ON prior_prompt.id = prior.id
        WHERE prior.created_by_id = cap.created_by_id
          AND prior.is_slot_allocated = true
          AND prior.activated_at IS NOT NULL
          AND prior.deactivated_at IS NULL
          AND prior.deleted_at IS NULL
          AND prior_prompt.deleted_at IS NULL
          AND (prior.activated_at, prior.id) <= (cap.activated_at, cap.id)
        ORDER BY prior.activated_at, prior.id
        LIMIT 11
      ) earlier
    ) creator_rank ON true
    ORDER BY cap.activated_at, cap.id
  `)
  const { rows } = await query<
    CommunityAgentPrompt & { eligible: boolean; activation_cursor: string }
  >(statement)
  const scanned = rows.slice(0, limit)
  const last = scanned.at(-1)
  const items: ActiveCommunityAgentPromptPage['items'] = []
  for (const { eligible, ...row } of scanned) {
    if (eligible) items.push(row)
  }
  return {
    items,
    next: rows.length > limit && last ? { activatedAt: last.activation_cursor, id: last.id } : null,
  }
}
