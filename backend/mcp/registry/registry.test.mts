import { myMessageGroups } from '@voucha/mcp/my-messages'
import { myHouseholdGroups } from '@voucha/mcp/my-households'
import { participationWriteGroups } from './participation-write-groups.mts'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_TOOLS, getRegisteredToolByName } from './index.mts'
import { userMergedAccountGroups } from './user-merged-account-tools.mts'
import { userMergedParticipationGroups } from './user-merged-participation-tools.mts'
import { userMergedReadingGroups } from './user-merged-reading-tools.mts'
import { communityModerationGroups } from '../community-moderation-tools.mts'
import { getToolRequiredScopes, isToolMcpEligible, listToolsForAudience } from './select.mts'
import type { Tool } from '@services/openai-agents/tool-types'
import { SCOPE_DEFINITIONS } from '@modules/scopes'

const TOOLS_DIR = path.join(import.meta.dirname, '..')

// Files in tools/ that are NOT tool definitions (factories, helpers, types, barrel)
const NON_TOOL_FILES = new Set([
  'my-messages.mts',
  'my-households.mts',
  ...['tool', 'reads', 'writes'].map(name => `my-household-${name}.mts`),
  ...['output', 'tool', 'reads', 'writes'].map(name => `my-message-${name}.mts`),
  'bookmark-tool-support.mts',
  'community-moderation-contract.mts',
  'community-moderation-guards.mts',
  'community-moderation-input-paths.mts',
  'community-moderation-list-writes.mts',
  'community-moderation-other-writes.mts',
  'community-moderation-pending-post-text.mts',
  'community-moderation-output-parts.mts',
  'community-moderation-output-reads.mts',
  'community-moderation-output-schemas.mts',
  'community-moderation-output-writes.mts',
  'community-moderation-queue-writes.mts',
  'community-moderation-read-analytics.mts',
  'community-moderation-read-lists.mts',
  'community-moderation-read-queues.mts',
  'community-moderation-routes.mts',
  'community-moderation-routes-read-add.mts',
  'community-moderation-routes-update-remove.mts',
  'community-moderation-tools.mts',
  'community-moderation-update-applications.mts',
  'community-moderation-update-community.mts',
  'community-moderation-update-modmail-post-settings.mts',
  'community-moderation-update-pinned-posts.mts',
  'community-moderation-update-publications.mts',
  'community-moderation-update-reports.mts',
  'community-moderation-update-vacation.mts',
  'community-moderation-updates.mts',
  'create-get-my-entity-list-tool.mts',
  'create-manage-entity-tool.mts',
  'create-merged-tool.mts',
  'create-merged-tool-schema.mts',
  'delegated-authority.mts',
  'get-domain-ratings-helpers.mts',
  'get-domain-ratings-output-schema.mts',
  'list-read-access.mts',
  'list-tool-support.mts',
  'mcp-case-output.mts',
  'mcp-community-list-item-output.mts',
  'mcp-community-output.mts',
  'mcp-hostname-output.mts',
  'mcp-list-output.mts',
  'mcp-notification-output.mts',
  'mcp-post-access.mts',
  'mcp-post-output.mts',
  'mcp-read-output.mts',
  'mcp-rss-output.mts',
  'mcp-story-output.mts',
  'mcp-user-output.mts',
  'notification-tool-support.mts',
  'option-output-pointers.mts',
  'output-schema-shapes.mts',
  'paged-search.mts',
  'preference-tool-support.mts',
  'private-user.mts',
  'personal-feed-support.mts',
  'profile-tool-support.mts',
  'prune-to-schema.mts',
  'post-write-tool-support.mts',
  'read-tool-output-schema.mts',
  'rss-feed-crawl-reads.mts',
  'rss-feed-discovery.mts',
  'rss-feed-item-reads.mts',
  'rss-feed-item-social-reads.mts',
  'rss-feed-reads.mts',
  'referral-link-tool-support.mts',
  'add-list-items.mts',
  'entity-reference-schema.mts',
  'resolve-entity-reference.mts',
  'resolve-post.mts',
  'resolve-rss-feed.mts',
  'resolve-topic.mts',
  'set-bookmark-batch.mts',
  'route-response-schema.mts',
  'search-system.mts',
  'search-post-input.mts',
  'schema-validator.mts',
  'select-api-by-argument.mts',
  'topic-hierarchy-result.mts',
  'topic-output-schema-parts.mts',
  'topic-recommendation-read-output.mts',
  'topic-recommendation-tool-support.mts',
  'tool-schema-contract.mts',
  'tool-schema-traversal.mts',
  'untrusted-output.mts',
])

describe('tool registry', () => {
  it('registers named tools and references every anonymous option source exactly once', async () => {
    const mergedGroups = [
      ...myMessageGroups,
      ...myHouseholdGroups,
      ...participationWriteGroups,
      ...userMergedAccountGroups,
      ...userMergedParticipationGroups,
      ...userMergedReadingGroups,
      ...communityModerationGroups,
    ]
    const sourceCounts = new Map<object, number>()
    for (const group of mergedGroups) {
      for (const { source } of group.options) {
        sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
      }
    }
    expect([...sourceCounts.values()].filter(count => count !== 1)).toEqual([])
    expect(mergedGroups.filter(group => !getRegisteredToolByName(group.name))).toEqual([])
    const entries = await readdir(TOOLS_DIR)
    const toolFiles = entries.filter(
      f =>
        f.endsWith('.mts') &&
        !f.includes('.test.') &&
        !f.includes('.mock.') &&
        !f.includes('.generated.') &&
        !NON_TOOL_FILES.has(f),
    )
    const registeredNames = new Set(ALL_TOOLS.map(t => t.schema.name))
    const unregistered: string[] = []
    for (const file of toolFiles) {
      const baseName = file.slice(0, -'.mts'.length)
      const mod = await import(`../${baseName}.mts`)
      const tool = mod.default as { schema?: { name?: string } } | undefined
      const name = tool?.schema?.name
      if (!tool || (name == null ? sourceCounts.get(tool) !== 1 : !registeredNames.has(name))) {
        unregistered.push(file)
      }
    }
    expect(unregistered).toEqual([])
  })

  it('has unique tool names', () => {
    const names = ALL_TOOLS.map(t => t.schema.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every exposed tool is arity-1 with explicit API and audience-correct scopes', () => {
    const invalid = ALL_TOOLS.filter(tool => {
      const audience = tool.meta?.audience
      if (audience == null) return false
      return (
        !isToolMcpEligible(tool) ||
        !('api' in tool.meta!) ||
        getToolRequiredScopes(tool, audience) == null
      )
    })
    expect(invalid.map(tool => tool.schema.name)).toEqual([])
  })

  it('declares prerequisites for each MCP write scope', () => {
    const missing = ALL_TOOLS.flatMap(tool => {
      const audience = tool.meta?.audience
      if (audience == null) return []
      const scopes = getToolRequiredScopes(tool, audience) ?? []
      return scopes.flatMap(scope => {
        const prerequisite = SCOPE_DEFINITIONS[scope].requires
        return prerequisite != null && !scopes.includes(prerequisite as typeof scope)
          ? [`${tool.schema.name}:${scope}:${prerequisite}`]
          : []
      })
    })
    expect(missing).toEqual([])
  })

  it('user and community mutations declare a paid plan', () => {
    const missing = ALL_TOOLS.filter(tool => {
      if (!['user', 'community_moderation'].includes(tool.meta?.audience ?? '')) return false
      if (tool.meta?.annotations.readOnlyHint === true) return false
      return tool.meta?.plan !== 'plus' && tool.meta?.plan !== 'pro'
    })
    expect(missing.map(tool => tool.schema.name)).toEqual([])
  })

  it('reads and staff tools declare no paid plan', () => {
    const gated = ALL_TOOLS.filter(tool => {
      if (tool.meta?.audience == null) return false
      if (
        ['user', 'community_moderation'].includes(tool.meta.audience) &&
        !tool.meta.annotations.readOnlyHint
      )
        return false
      return tool.meta.plan != null && tool.meta.plan !== 'free'
    })
    expect(gated.map(tool => tool.schema.name)).toEqual([])
  })

  it('rejects scopes declared for the opposite MCP audience', () => {
    const tool: Tool = {
      schema: { name: 'wrong_audience', type: 'function', parameters: null, strict: null },
      function: () => () => Promise.resolve({}),
      meta: {
        audience: 'user',
        title: 'Wrong audience',
        requiredScopes: ['mcp.admin:read'],
        annotations: { readOnlyHint: true },
        api: null,
      },
    }
    expect(getToolRequiredScopes(tool, 'user')).toBeNull()
    expect(getToolRequiredScopes(tool, 'admin')).toBeNull()
  })

  it('curried tools are internal-only', () => {
    expect(
      ALL_TOOLS.filter(tool => tool.function.length > 1 && tool.meta?.audience != null).map(
        tool => tool.schema.name,
      ),
    ).toEqual([])
  })

  it('getRegisteredToolByName returns correct tool', () => {
    const tool = getRegisteredToolByName('discover_topics')
    expect(tool?.schema.name).toBe('discover_topics')
  })

  it('getRegisteredToolByName returns undefined for unknown name', () => {
    expect(getRegisteredToolByName('nonexistent_tool')).toBeUndefined()
  })

  it('selects only tools assigned to the requested audience', () => {
    expect(listToolsForAudience('user', ALL_TOOLS)).toEqual(
      ALL_TOOLS.filter(tool => tool.meta?.audience === 'user'),
    )
  })
})
