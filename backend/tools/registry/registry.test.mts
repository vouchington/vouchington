import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_TOOLS, getRegisteredToolByName } from './index.mts'
import {
  getMcpPlanInvariantViolations,
  getToolRequiredScopes,
  isToolMcpEligible,
  listToolsForSurface,
} from './select.mts'
import type { Tool } from '../types.mts'
import { SCOPE_DEFINITIONS } from '@modules/scopes'

const TOOLS_DIR = path.join(import.meta.dirname, '..')

// Files in tools/ that are NOT tool definitions (factories, helpers, types, barrel)
const NON_TOOL_FILES = new Set([
  'create-get-my-entity-list-tool.mts',
  'create-manage-entity-tool.mts',
  'get-domain-ratings-helpers.mts',
  'index.mts',
  'private-user.mts',
  'search-crawl-tool.mts',
  'search-system.mts',
  'types.mts',
])

describe('tool registry', () => {
  it('registers every tool source file', async () => {
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
      if (name == null || !registeredNames.has(name)) unregistered.push(file)
    }
    expect(unregistered).toEqual([])
  })

  it('has unique tool names', () => {
    const names = ALL_TOOLS.map(t => t.schema.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every mcp/admin_mcp/client tool is arity-1 (not curried)', () => {
    const nonEligible = ALL_TOOLS.filter(tool => {
      const surfaces = new Set(tool.meta?.surfaces ?? ['internal'])
      return (
        (surfaces.has('mcp') || surfaces.has('admin_mcp') || surfaces.has('client')) &&
        !isToolMcpEligible(tool)
      )
    })
    expect(nonEligible.map(t => t.schema.name)).toEqual([])
  })

  it('every mcp/admin_mcp/client tool has explicit readOnlyHint or destructiveHint', () => {
    const missing = ALL_TOOLS.filter(tool => {
      const surfaces = new Set(tool.meta?.surfaces ?? ['internal'])
      if (!surfaces.has('mcp') && !surfaces.has('admin_mcp') && !surfaces.has('client')) {
        return false
      }
      const annotations = tool.meta?.annotations
      return annotations?.readOnlyHint === undefined && annotations?.destructiveHint === undefined
    })
    expect(missing.map(t => t.schema.name)).toEqual([])
  })

  it('every mcp/admin_mcp/client tool has explicit api field', () => {
    const missing = ALL_TOOLS.filter(tool => {
      const surfaces = new Set(tool.meta?.surfaces ?? ['internal'])
      if (!surfaces.has('mcp') && !surfaces.has('admin_mcp') && !surfaces.has('client')) {
        return false
      }
      return tool.meta == null || !('api' in tool.meta)
    })
    expect(missing.map(t => t.schema.name)).toEqual([])
  })

  it('every MCP surface tool declares canonical, surface-correct scopes', () => {
    const missing = ALL_TOOLS.flatMap(tool => {
      const surfaces = tool.meta?.surfaces ?? ['internal']
      return surfaces
        .filter(
          (surface): surface is 'mcp' | 'admin_mcp' => surface === 'mcp' || surface === 'admin_mcp',
        )
        .filter(surface => getToolRequiredScopes(tool, surface) == null)
        .map(surface => `${tool.schema.name}:${surface}`)
    })
    expect(missing).toEqual([])
  })

  it('declares prerequisites for each MCP write scope', () => {
    const missing = ALL_TOOLS.flatMap(tool =>
      (tool.meta?.surfaces ?? ['internal'])
        .filter(
          (surface): surface is 'mcp' | 'admin_mcp' => surface === 'mcp' || surface === 'admin_mcp',
        )
        .flatMap(surface => {
          const scopes = getToolRequiredScopes(tool, surface) ?? []
          return scopes.flatMap(scope => {
            const prerequisite = SCOPE_DEFINITIONS[scope].requires
            return prerequisite != null && !scopes.includes(prerequisite as typeof scope)
              ? [`${tool.schema.name}:${scope}:${prerequisite}`]
              : []
          })
        }),
    )

    expect(missing).toEqual([])
  })

  it('requires paid plans for user MCP mutations without paywalling reads or admin tools', () => {
    expect(getMcpPlanInvariantViolations(ALL_TOOLS)).toEqual([])
  })

  it('rejects a mutating tool shared between user and admin MCP surfaces', () => {
    const tool: Tool = {
      schema: { name: 'shared_mutation', type: 'function', parameters: null, strict: null },
      function: () => () => Promise.resolve({}),
      meta: {
        surfaces: ['mcp', 'admin_mcp'],
        plan: 'plus',
        annotations: { destructiveHint: true },
        requiredScopes: {
          mcp: ['cards:read', 'cards:write'],
          admin_mcp: ['support-messages:read'],
        },
        api: null,
      },
    }

    expect(getMcpPlanInvariantViolations([tool])).toEqual([
      'shared_mutation: mutating tools cannot share mcp and admin_mcp surfaces',
    ])
  })

  it('rejects scopes declared for the opposite MCP audience', () => {
    const tool: Tool = {
      schema: {
        name: 'admin_scope_on_user_surface',
        type: 'function',
        parameters: null,
        strict: null,
      },
      function: () => () => Promise.resolve({}),
      meta: {
        surfaces: ['mcp'],
        requiredScopes: { mcp: ['support-messages:read'] },
        api: null,
      },
    }

    expect(getToolRequiredScopes(tool, 'mcp')).toBeNull()
  })

  it('curried tools are internal-only', () => {
    const wronglySurfaced = ALL_TOOLS.filter(tool => {
      if (tool.function.length <= 1) return false
      const surfaces = tool.meta?.surfaces ?? ['internal']
      return surfaces.length !== 1 || surfaces[0] !== 'internal'
    })
    expect(wronglySurfaced.map(t => t.schema.name)).toEqual([])
  })

  it('getRegisteredToolByName returns correct tool', () => {
    const tool = getRegisteredToolByName('search_topics')
    expect(tool?.schema.name).toBe('search_topics')
  })

  it('getRegisteredToolByName returns undefined for unknown name', () => {
    expect(getRegisteredToolByName('nonexistent_tool')).toBeUndefined()
  })

  it('listToolsForSurface filters correctly', () => {
    const clientTools = listToolsForSurface('client', ALL_TOOLS)
    const nonClientTools = clientTools.filter(t => !t.meta?.surfaces?.includes('client'))
    expect(nonClientTools.map(t => t.schema.name)).toEqual([])
    const internalTools = listToolsForSurface('internal', ALL_TOOLS)
    // All tools are on 'internal' (either explicitly or via default)
    expect(internalTools.length).toBe(ALL_TOOLS.length)
  })
})
