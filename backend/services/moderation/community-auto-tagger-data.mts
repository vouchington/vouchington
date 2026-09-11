import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isBaselineModeratorSlug } from '@services/agents/moderator-configs'
import type { CommunityAiAgentEntitlement } from './community-agent-entitlements.mts'
import type { ModeratorOnFlagAction } from './moderation-prompts.mts'
import {
  AI_GENERATED_MODERATOR_SLUG,
  CLICK_BAIT_MODERATOR_SLUG,
  getTopicSlugsForModerator,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_MODERATOR_SLUG,
  POLITICS_AVERSE_MODERATOR_SLUG,
  SELF_PROMOTION_MODERATOR_SLUG,
  SHIT_POST_MODERATOR_SLUG,
  VAGUE_POST_MODERATOR_SLUG,
} from './moderator-labels.mts'

const FIXED_LABEL_MODERATOR_SLUGS = [
  SELF_PROMOTION_MODERATOR_SLUG,
  MARKETPLACE_MODERATOR_SLUG,
  AI_GENERATED_MODERATOR_SLUG,
  POLITICS_AVERSE_MODERATOR_SLUG,
  CLICK_BAIT_MODERATOR_SLUG,
  VAGUE_POST_MODERATOR_SLUG,
  SHIT_POST_MODERATOR_SLUG,
] as const

export type CommunityAutoTaggerAgentSlug = (typeof FIXED_LABEL_MODERATOR_SLUGS)[number]

export type CommunityAutoTaggerAgent = {
  slug: CommunityAutoTaggerAgentSlug
  agent_id: string
  system_user_id: string
  system_username: string
  label_topic_slugs: string[]
  on_flag_action: ModeratorOnFlagAction
  enabled: boolean
  always_on: boolean
  enabled_at: Date | null
  enabled_by_id: string | null
  entitlement: CommunityAiAgentEntitlement
}

type CommunityAutoTaggerAgentRow = {
  slug: CommunityAutoTaggerAgentSlug
  agent_id: string
  system_user_id: string
  system_username: string
  on_flag_action: ModeratorOnFlagAction
  enabled_at: Date | null
  disabled_at: Date | null
  enabled_by_id: string | null
}

export function getCommunityAutoTaggerAgentSlugs(): CommunityAutoTaggerAgentSlug[] {
  return [...FIXED_LABEL_MODERATOR_SLUGS]
}

export function isCommunityAutoTaggerAgentSlug(
  value: string,
): value is CommunityAutoTaggerAgentSlug {
  return FIXED_LABEL_MODERATOR_SLUGS.includes(value as CommunityAutoTaggerAgentSlug)
}

export async function getDisabledCommunityAutoTaggerModeratorSlugs(
  communityId: string | null | undefined,
): Promise<CommunityAutoTaggerAgentSlug[]> {
  if (!communityId) return []

  const slugs = getCommunityAutoTaggerAgentSlugs()
  const { rows } = await read(sql`/* getDisabledCommunityAutoTaggerModeratorSlugs */
    SELECT am.slug
    FROM community_auto_tagger_agents cata
    JOIN agents a ON a.id = cata.agent_id
    JOIN agents__moderators am ON am.agent_id = a.id
    WHERE cata.community_id = ${communityId}
      AND cata.disabled_at IS NOT NULL
      AND am.slug = ANY(${slugs}::text[])
      AND a.agent_type = 'moderator'
      AND a.activated_at IS NOT NULL
      AND a.deactivated_at IS NULL
      AND a.deleted_at IS NULL
    ORDER BY array_position(${slugs}::text[], am.slug), am.slug
  `)

  return rows.map(row => row.slug as CommunityAutoTaggerAgentSlug)
}

export async function getEnabledCommunityAutoTaggerModeratorSlugs(
  communityId: string | null | undefined,
): Promise<CommunityAutoTaggerAgentSlug[]> {
  if (!communityId) return []

  const slugs = getCommunityAutoTaggerAgentSlugs()
  const { rows } = await read(sql`/* getEnabledCommunityAutoTaggerModeratorSlugs */
    SELECT am.slug
    FROM community_auto_tagger_agents cata
    JOIN agents a ON a.id = cata.agent_id
    JOIN agents__moderators am ON am.agent_id = a.id
    WHERE cata.community_id = ${communityId}
      AND cata.disabled_at IS NULL
      AND am.slug = ANY(${slugs}::text[])
      AND a.agent_type = 'moderator'
      AND a.activated_at IS NOT NULL
      AND a.deactivated_at IS NULL
      AND a.deleted_at IS NULL
    ORDER BY array_position(${slugs}::text[], am.slug), am.slug
  `)

  return rows.map(row => row.slug as CommunityAutoTaggerAgentSlug)
}

export async function getAgentIdByModeratorSlug(
  moderatorSlug: CommunityAutoTaggerAgentSlug,
): Promise<string | null> {
  const { rows } = await read(sql`/* getAgentIdByModeratorSlug */
    SELECT a.id
    FROM agents a
    JOIN agents__moderators am ON am.agent_id = a.id
    WHERE am.slug = ${moderatorSlug}
      AND a.agent_type = 'moderator'
      AND a.activated_at IS NOT NULL
      AND a.deactivated_at IS NULL
      AND a.deleted_at IS NULL
    LIMIT 1
  `)
  return (rows[0]?.id as string | undefined) ?? null
}

export async function getCommunityAutoTaggerAgentRows(
  communityId: string,
): Promise<CommunityAutoTaggerAgentRow[]> {
  const slugs = getCommunityAutoTaggerAgentSlugs()
  const { rows } = await read(sql`/* getCommunityAutoTaggerAgentRows */
    SELECT
      am.slug,
      a.id AS agent_id,
      a.system_user_id,
      u.username AS system_username,
      am.on_flag_action,
      cata.enabled_at,
      cata.disabled_at,
      cata.enabled_by_id
    FROM agents a
    JOIN agents__moderators am ON am.agent_id = a.id
    JOIN users u ON u.id = a.system_user_id
    LEFT JOIN community_auto_tagger_agents cata
      ON cata.agent_id = a.id
      AND cata.community_id = ${communityId}
    WHERE am.slug = ANY(${slugs}::text[])
      AND a.agent_type = 'moderator'
      AND a.activated_at IS NOT NULL
      AND a.deactivated_at IS NULL
      AND a.deleted_at IS NULL
    ORDER BY array_position(${slugs}::text[], am.slug), am.slug
  `)

  return rows as CommunityAutoTaggerAgentRow[]
}

export function mapCommunityAutoTaggerAgent(
  row: CommunityAutoTaggerAgentRow,
  entitlement: CommunityAiAgentEntitlement,
): CommunityAutoTaggerAgent {
  const alwaysOn = isBaselineModeratorSlug(row.slug)
  const enabled = alwaysOn
    ? row.disabled_at === null
    : row.enabled_at !== null && row.disabled_at === null
  return {
    slug: row.slug,
    agent_id: row.agent_id,
    system_user_id: row.system_user_id,
    system_username: row.system_username,
    label_topic_slugs: getLabelTopicSlugs(row.slug),
    on_flag_action: row.on_flag_action,
    enabled,
    always_on: alwaysOn,
    enabled_at: row.enabled_at,
    enabled_by_id: row.enabled_by_id,
    entitlement,
  }
}

function getLabelTopicSlugs(slug: CommunityAutoTaggerAgentSlug): string[] {
  if (slug === MARKETPLACE_MODERATOR_SLUG) {
    return getTopicSlugsForModerator(slug, [...MARKETPLACE_CATEGORIES])
  }
  return getTopicSlugsForModerator(slug, undefined)
}
