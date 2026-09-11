import { describe, expect, it } from 'vitest'
import { isToolAllowedForPlan, listToolsForSurface, isToolMcpEligible } from './select.mts'
import type { Tool } from '../types.mts'

function makeTool(plan?: 'free' | 'plus' | 'pro', surfaces?: string[]): Tool {
  return {
    schema: { name: 'test_tool', type: 'function', parameters: null, strict: null },
    function: (_user: unknown) => () => Promise.resolve({}),
    meta: {
      plan,
      surfaces: (surfaces ?? ['internal']) as NonNullable<Tool['meta']>['surfaces'],
      annotations: { readOnlyHint: true },
      api: null,
    },
  } as unknown as Tool
}

describe('isToolAllowedForPlan', () => {
  it('allows any plan when tool has no plan requirement', () => {
    const tool = makeTool(undefined)
    expect(isToolAllowedForPlan(tool, { membership_plan: null })).toBe(true)
    expect(isToolAllowedForPlan(tool, { membership_plan: 'plus' })).toBe(true)
    expect(isToolAllowedForPlan(tool, { membership_plan: 'pro' })).toBe(true)
  })

  it('allows any plan when tool plan is "free"', () => {
    const tool = makeTool('free')
    expect(isToolAllowedForPlan(tool, { membership_plan: null })).toBe(true)
    expect(isToolAllowedForPlan(tool, { membership_plan: 'plus' })).toBe(true)
    expect(isToolAllowedForPlan(tool, { membership_plan: 'pro' })).toBe(true)
  })

  it('denies null/free plan when tool requires "plus"', () => {
    const tool = makeTool('plus')
    expect(isToolAllowedForPlan(tool, { membership_plan: null })).toBe(false)
  })

  it('allows plus plan when tool requires "plus"', () => {
    const tool = makeTool('plus')
    expect(isToolAllowedForPlan(tool, { membership_plan: 'plus' })).toBe(true)
  })

  it('allows pro plan when tool requires "plus"', () => {
    const tool = makeTool('plus')
    expect(isToolAllowedForPlan(tool, { membership_plan: 'pro' })).toBe(true)
  })

  it('denies null/free plan when tool requires "pro"', () => {
    const tool = makeTool('pro')
    expect(isToolAllowedForPlan(tool, { membership_plan: null })).toBe(false)
  })

  it('denies plus plan when tool requires "pro"', () => {
    const tool = makeTool('pro')
    expect(isToolAllowedForPlan(tool, { membership_plan: 'plus' })).toBe(false)
  })

  it('allows pro plan when tool requires "pro"', () => {
    const tool = makeTool('pro')
    expect(isToolAllowedForPlan(tool, { membership_plan: 'pro' })).toBe(true)
  })

  it('returns false for an unrecognised plan value on the tool', () => {
    const tool = {
      schema: { name: 'test_tool', type: 'function', parameters: null, strict: null },
      function: (_user: unknown) => () => Promise.resolve({}),
      meta: {
        plan: 'enterprise' as unknown as 'pro',
        surfaces: ['mcp'] as NonNullable<Tool['meta']>['surfaces'],
        annotations: { readOnlyHint: true },
        api: null,
      },
    } as unknown as Tool
    expect(isToolAllowedForPlan(tool, { membership_plan: 'pro' })).toBe(false)
  })
})

describe('listToolsForSurface', () => {
  it('returns tools that include the given surface', () => {
    const internal = makeTool(undefined, ['internal'])
    const mcp = makeTool(undefined, ['mcp'])
    const both = makeTool(undefined, ['internal', 'mcp'])

    const result = listToolsForSurface('mcp', [internal, mcp, both])
    expect(result).toContain(mcp)
    expect(result).toContain(both)
    expect(result).not.toContain(internal)
  })

  it('defaults to internal surface when meta is absent', () => {
    const toolNoMeta = {
      schema: { name: 'no_meta', type: 'function', parameters: null, strict: null },
      function: () => () => Promise.resolve({}),
    } as unknown as Tool

    const result = listToolsForSurface('internal', [toolNoMeta])
    expect(result).toContain(toolNoMeta)
  })
})

describe('isToolMcpEligible', () => {
  it('returns true for arity-1 functions', () => {
    const tool = makeTool()
    expect(isToolMcpEligible(tool)).toBe(true)
  })

  it('returns false for curried (arity > 1) functions', () => {
    const curriedTool = {
      schema: { name: 'curried', type: 'function', parameters: null, strict: null },
      function: (_user: unknown, _extra: unknown) => () => Promise.resolve({}),
    } as unknown as Tool
    expect(isToolMcpEligible(curriedTool)).toBe(false)
  })
})
