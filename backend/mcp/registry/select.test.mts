import { describe, expect, it } from 'vitest'
import { isToolAllowedForPlan, listToolsForAudience, isToolMcpEligible } from './select.mts'
import type { Tool } from '@services/openai-agents/tool-types'

function makeTool(
  plan?: 'free' | 'plus' | 'pro',
  audience?: NonNullable<Tool['meta']>['audience'],
): Tool {
  return {
    schema: { name: 'test_tool', type: 'function', parameters: null, strict: null },
    function: (_user: unknown) => () => Promise.resolve({}),
    meta: {
      plan,
      audience,
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
        audience: 'user' as NonNullable<Tool['meta']>['audience'],
        annotations: { readOnlyHint: true },
        api: null,
      },
    } as unknown as Tool
    expect(isToolAllowedForPlan(tool, { membership_plan: 'pro' })).toBe(false)
  })
})

describe('listToolsForAudience', () => {
  it('selects exactly one server audience and excludes internal-only tools', () => {
    const internal = makeTool()
    const user = makeTool(undefined, 'user')
    const admin = makeTool(undefined, 'admin')
    const community = makeTool(undefined, 'community_moderation')
    const brand = makeTool(undefined, 'brand')
    const legal = makeTool(undefined, 'legal')
    const tools = [internal, user, admin, community, brand, legal]
    expect(listToolsForAudience('user', tools)).toEqual([user])
    expect(listToolsForAudience('admin', tools)).toEqual([admin])
    expect(listToolsForAudience('community_moderation', tools)).toEqual([community])
    expect(listToolsForAudience('brand', tools)).toEqual([brand])
    expect(listToolsForAudience('legal', tools)).toEqual([legal])
  })

  it('excludes tools without metadata from server discovery', () => {
    const toolNoMeta = { schema: { name: 'no_meta' } } as Tool
    expect(listToolsForAudience('user', [toolNoMeta])).toEqual([])
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
