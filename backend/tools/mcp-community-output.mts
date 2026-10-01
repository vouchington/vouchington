import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  loadCommunityForViewer,
  type Community,
  type CommunityMetrics,
  type CommunityWithOwner,
} from '@services/communities'
import createHttpError from 'http-errors'
import { nullable } from './output-schema-shapes.mts'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

/** The page sizes of the community read tools: the signed-out REST cap, not the service's 100. */
export const COMMUNITY_PAGE_LIMIT = { min: 1, max: 25, default: 20 } as const

export const COMMUNITY_NOT_FOUND = { success: false, error: 'Community not found' } as const

const COMMUNITY_FIELDS = [
  'id',
  'slug',
  'name',
  'markdown',
  'rules_markdown',
  'member_roster_visibility',
  'list_type',
  'allow_review_posts',
  'allow_data_point_posts',
  'archived_at',
  'created_at',
  'updated_at',
] as const

const METRIC_FIELDS = [
  'member_count',
  'post_count',
  'list_item_count',
  'proxy_follow_count',
  'proxy_mute_count',
  'virtual_subscription_count',
] as const

/** One community as an MCP client receives it. Private communities never reach this shape. */
export type McpCommunity = {
  id: string
  slug: string
  name: string
  markdown: string | null
  rules_markdown: string | null
  member_roster_visibility: Community['member_roster_visibility']
  list_type: Community['list_type']
  allow_review_posts: boolean
  allow_data_point_posts: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type McpCommunityOwner = { id: string; username: string | null }

export type McpCommunityMetrics = Pick<CommunityMetrics, (typeof METRIC_FIELDS)[number]>

/** A community with its owner and public counts, as `search_communities` and `get_community` return it. */
export type McpCommunityEntry = {
  community: McpCommunity
  owner: McpCommunityOwner | null
  metrics: McpCommunityMetrics | null
}

/**
 * Loads a community the way a signed-out reader sees it, whoever is calling. A private community
 * is as missing as a deleted or unknown one, even to its own members, moderators and owner.
 */
export async function loadPublicCommunity(idOrSlug: string): Promise<CommunityWithOwner | null> {
  try {
    return (await loadCommunityForViewer(null, idOrSlug)).community
  } catch (error: unknown) {
    if (createHttpError.isHttpError(error) && error.status === 404) return null
    throw error
  }
}

function externalText(text: string | null, contentType: string): Promise<string | null> {
  if (text === null) return Promise.resolve(null)
  return sanitizePromptInjection(text).then(clean =>
    wrapExternalContent(clean, { source: 'community', contentType }),
  )
}

const iso = (value: Date | string): string => new Date(value).toISOString()

/** Names are sanitized like titles; the description and rules are wrapped as external content. */
export async function toMcpCommunity(community: Community): Promise<McpCommunity> {
  const [name, markdown, rulesMarkdown] = await Promise.all([
    sanitizePromptInjection(community.name, { isTitle: true }),
    externalText(community.markdown, 'community_description'),
    externalText(community.rules_markdown, 'community_rules'),
  ])
  return {
    id: community.id,
    slug: community.slug,
    name,
    markdown,
    rules_markdown: rulesMarkdown,
    member_roster_visibility: community.member_roster_visibility,
    list_type: community.list_type,
    allow_review_posts: community.allow_review_posts,
    allow_data_point_posts: community.allow_data_point_posts,
    archived_at: community.archived_at ? iso(community.archived_at) : null,
    created_at: iso(community.created_at),
    updated_at: iso(community.updated_at),
  }
}

export async function toMcpCommunityOwner(
  owner: CommunityWithOwner['owner'],
): Promise<McpCommunityOwner | null> {
  if (!owner) return null
  return {
    id: owner.id,
    username:
      owner.username === null
        ? null
        : await sanitizePromptInjection(owner.username, { isTitle: true }),
  }
}

export function toMcpCommunityMetrics(
  metrics: CommunityMetrics | null | undefined,
): McpCommunityMetrics | null {
  if (!metrics) return null
  return {
    member_count: metrics.member_count,
    post_count: metrics.post_count,
    list_item_count: metrics.list_item_count,
    proxy_follow_count: metrics.proxy_follow_count,
    proxy_mute_count: metrics.proxy_mute_count,
    virtual_subscription_count: metrics.virtual_subscription_count,
  }
}

export async function toMcpCommunityEntry(
  community: Community,
  owner: CommunityWithOwner['owner'],
  metrics: CommunityMetrics | null | undefined,
): Promise<McpCommunityEntry> {
  return {
    community: await toMcpCommunity(community),
    owner: await toMcpCommunityOwner(owner),
    metrics: toMcpCommunityMetrics(metrics),
  }
}

/** The properties of an `McpCommunityEntry`, from the generated `Community` contracts. */
export function mcpCommunityEntryProperties() {
  return {
    community: closedObject(pickProperties('Community', COMMUNITY_FIELDS)),
    owner: nullable(closedObject(pickProperties('CommunityOwner', ['id', 'username']))),
    metrics: nullable(closedObject(pickProperties('CommunityMetrics', METRIC_FIELDS))),
  }
}

/** The `limit` and `after` inputs every paged community read tool takes. */
export function communityPageInputProperties(noun: string) {
  const { min, max, default: defaultLimit } = COMMUNITY_PAGE_LIMIT
  return {
    limit: {
      type: 'integer',
      minimum: min,
      maximum: max,
      description: `${noun} per page, from ${min} to ${max} (default: ${defaultLimit})`,
    },
    after: {
      type: 'string',
      description: 'Opaque cursor from the previous page_info.end_cursor, for the next page.',
    },
  }
}

export function communityPageInfoSchema() {
  return closedObject(pickProperties('PageInfo', ['has_next_page', 'start_cursor', 'end_cursor']))
}
