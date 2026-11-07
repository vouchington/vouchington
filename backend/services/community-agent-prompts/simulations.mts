import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const COMMUNITY_AGENT_PROMPT_SIMULATION_WINDOWS = [24, 168, 720] as const
export type CommunityAgentPromptSimulationWindow =
  (typeof COMMUNITY_AGENT_PROMPT_SIMULATION_WINDOWS)[number]

export type CommunityAgentPromptSimulationPost = {
  id: string
  title: string
  markdown: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
  post_type: string
  created_by_id: string | null
  approved_at: Date
  content_excerpt: string
}

/** The false-positive rate is an estimate over this many of the prompt's newest flagged moderations. */
export const FALSE_POSITIVE_ESTIMATE_SAMPLE_SIZE = 1000

export type CommunityAgentPromptFalsePositiveEstimate = {
  sampled_flagged_count: number
  sampled_approved_count: number
  rate: number | null
}

export function normalizeSimulationTimeWindow(
  value: unknown,
): CommunityAgentPromptSimulationWindow {
  if (value === undefined || value === null) return 168
  const numberValue = Number(value)
  if (
    COMMUNITY_AGENT_PROMPT_SIMULATION_WINDOWS.includes(
      numberValue as CommunityAgentPromptSimulationWindow,
    )
  ) {
    return numberValue as CommunityAgentPromptSimulationWindow
  }
  throw new Error('time_window_hours must be one of 24, 168, or 720')
}

export function normalizeSimulationLimit(value: unknown): number {
  if (value === undefined || value === null) return 25
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 50) {
    throw new Error('limit must be an integer between 1 and 50')
  }
  return numberValue
}

export async function searchCommunityAgentPromptSimulationPosts(
  communityId: string,
  options: { timeWindowHours: CommunityAgentPromptSimulationWindow; limit: number },
): Promise<CommunityAgentPromptSimulationPost[]> {
  const { rows } = await read(sql`/* searchCommunityAgentPromptSimulationPosts */
    WITH candidate_posts AS MATERIALIZED (
    SELECT p.id, cpr.approved_at
    FROM community_post_reviews cpr
    JOIN posts p ON p.id = cpr.post_id
    WHERE cpr.community_id = ${communityId}
      AND p.community_id = ${communityId}
      AND p.deleted_at IS NULL
      AND p.approved_at IS NOT NULL
      AND cpr.approved_at IS NOT NULL
      AND cpr.approved_at >= CURRENT_TIMESTAMP - (${options.timeWindowHours}::integer * INTERVAL '1 hour')
      AND cpr.unpublished_at IS NULL
      AND cpr.rejected_at IS NULL
    ORDER BY cpr.approved_at DESC, p.id DESC
    LIMIT ${options.limit}
    )
    SELECT
      p.id,
      p.title,
      p.markdown,
      p.declared_language,
      p.lingua_rs_detected_language,
      p.post_type,
      p.created_by_id,
      candidates.approved_at
    FROM candidate_posts candidates
    JOIN view_posts p ON p.id = candidates.id
    ORDER BY candidates.approved_at DESC, candidates.id DESC
  `)

  return rows.map(row => {
    const markdown = typeof row.markdown === 'string' ? row.markdown : ''
    const title = typeof row.title === 'string' ? row.title : ''
    return {
      id: row.id as string,
      title,
      markdown,
      declared_language: (row.declared_language as string | null) ?? null,
      lingua_rs_detected_language: (row.lingua_rs_detected_language as string | null) ?? null,
      post_type: row.post_type as string,
      created_by_id: (row.created_by_id as string | null) ?? null,
      approved_at: row.approved_at as Date,
      content_excerpt: createContentExcerpt(title, markdown),
    }
  })
}

export async function getCommunityAgentPromptFalsePositiveEstimate(
  communityId: string,
  promptId: string,
): Promise<CommunityAgentPromptFalsePositiveEstimate> {
  const { rows } = await read(sql`/* getCommunityAgentPromptFalsePositiveEstimate */
    WITH sampled_moderations AS MATERIALIZED (
      SELECT am.post_id, cap.community_id
      -- no-mistakes-disable-next-line postgres-required-predicates: no-mistakes FP jonathanong/no-mistakes#3112; remove when fixed. Newest FALSE_POSITIVE_ESTIMATE_SAMPLE_SIZE flagged moderations of one prompt, read through idx_agent_moderations__flagged_prompt (prompt_id, post_id DESC); the prompt's history is not a post_id range
      FROM agent_moderations am
      JOIN community_agent_prompts cap ON cap.id = am.prompt_id
      WHERE cap.community_id = ${communityId}
        AND am.prompt_id = ${promptId}
        AND am.is_flagged = true
        AND am.deleted_at IS NULL
      ORDER BY am.post_id DESC
      LIMIT ${FALSE_POSITIVE_ESTIMATE_SAMPLE_SIZE}
    )
    SELECT
      COUNT(*)::integer AS sampled_flagged_count,
      COUNT(*) FILTER (
        WHERE cpr.approved_at IS NOT NULL
          AND cpr.unpublished_at IS NULL
          AND cpr.rejected_at IS NULL
          AND p.approved_at IS NOT NULL
      )::integer AS sampled_approved_count
    FROM sampled_moderations sample
    LEFT JOIN view_posts p ON p.id = sample.post_id
    LEFT JOIN community_post_reviews cpr
      ON cpr.post_id = sample.post_id
      AND cpr.community_id = sample.community_id
  `)

  const row = rows[0] as
    | { sampled_flagged_count: number; sampled_approved_count: number }
    | undefined
  const historicalFlaggedCount = row?.sampled_flagged_count ?? 0
  const historicalApprovedCount = row?.sampled_approved_count ?? 0
  return {
    sampled_flagged_count: historicalFlaggedCount,
    sampled_approved_count: historicalApprovedCount,
    rate: historicalFlaggedCount === 0 ? null : historicalApprovedCount / historicalFlaggedCount,
  }
}

function createContentExcerpt(title: string, markdown: string): string {
  const text = `${title}\n${markdown}`.replace(/\s+/g, ' ').trim()
  if (text.length <= 240) return text
  return `${text.slice(0, 237).trimEnd()}...`
}
