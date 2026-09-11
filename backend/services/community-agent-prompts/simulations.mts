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

export type CommunityAgentPromptFalsePositiveEstimate = {
  historical_flagged_count: number
  historical_approved_count: number
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
    SELECT
      p.id,
      p.title,
      p.markdown,
      p.declared_language,
      p.lingua_rs_detected_language,
      p.post_type,
      p.created_by_id,
      cpr.approved_at
    FROM community_post_reviews cpr
    JOIN view_posts p ON p.id = cpr.post_id
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
    SELECT
      COUNT(*)::integer AS historical_flagged_count,
      COUNT(*) FILTER (
        WHERE cpr.approved_at IS NOT NULL
          AND cpr.unpublished_at IS NULL
          AND cpr.rejected_at IS NULL
          AND p.approved_at IS NOT NULL
      )::integer AS historical_approved_count
    FROM agent_moderations am
    JOIN community_agent_prompts cap ON cap.id = am.prompt_id
    LEFT JOIN view_posts p ON p.id = am.post_id
    LEFT JOIN community_post_reviews cpr
      ON cpr.post_id = am.post_id
      AND cpr.community_id = cap.community_id
    WHERE cap.community_id = ${communityId}
      AND am.prompt_id = ${promptId}
      AND am.flagged = true
      AND am.deleted_at IS NULL
  `)

  const row = rows[0] as
    | { historical_flagged_count: number; historical_approved_count: number }
    | undefined
  const historicalFlaggedCount = row?.historical_flagged_count ?? 0
  const historicalApprovedCount = row?.historical_approved_count ?? 0
  return {
    historical_flagged_count: historicalFlaggedCount,
    historical_approved_count: historicalApprovedCount,
    rate: historicalFlaggedCount === 0 ? null : historicalApprovedCount / historicalFlaggedCount,
  }
}

function createContentExcerpt(title: string, markdown: string): string {
  const text = `${title}\n${markdown}`.replace(/\s+/g, ' ').trim()
  if (text.length <= 240) return text
  return `${text.slice(0, 237).trimEnd()}...`
}
