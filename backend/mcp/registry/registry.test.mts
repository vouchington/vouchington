import { describe, expect, it } from 'vitest'

import { SCOPE_DEFINITIONS } from '@modules/scopes'
import type { Tool } from '@services/openai-agents/tool-types'
import { readMyHouseholdsGroup } from '@voucha/mcp/my-household-reads'
import { manageMyHouseholdsGroup } from '@voucha/mcp/my-household-writes'
import { readMyMessagesGroup } from '@voucha/mcp/my-message-reads'
import { manageMyMessagesGroup } from '@voucha/mcp/my-message-writes'

import { communityModerationGroups } from '../community-moderation-tools.mts'
import { ALL_TOOLS, getRegisteredToolByName } from './index.mts'
import { participationWriteGroups } from './participation-write-groups.mts'
import { getToolRequiredScopes, isToolMcpEligible, listToolsForAudience } from './select.mts'
import { userMergedAccountGroups } from './user-merged-account-tools.mts'
import { userMergedParticipationGroups } from './user-merged-participation-tools.mts'
import { userMergedReadingGroups } from './user-merged-reading-tools.mts'

describe('tool registry', () => {
  it('registers named tools and references every anonymous option source exactly once', () => {
    const mergedGroups = [
      readMyMessagesGroup,
      manageMyMessagesGroup,
      readMyHouseholdsGroup,
      manageMyHouseholdsGroup,
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
