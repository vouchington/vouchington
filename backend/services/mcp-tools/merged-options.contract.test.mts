import fixtures from '../../test-helpers/merged-user-options.json' with { type: 'json' }
const { cases: CASES, groups: GROUPS, incompatible: INCOMPATIBLE } = fixtures
import { describe, expect, it } from 'vitest'
import { getRegisteredToolByName } from '@voucha/mcp/registry/index'
import { withScopePrerequisites, type ApiScope } from '@modules/scopes'
import { validateToolArguments } from './validate-tool-arguments.mts'
import { planMcpCalls } from './classify-calls.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'

// Approved #2495 map, expressed only in the new names/options. Each route is the selected
// REST bucket for these arguments, including the original source selector's default branch.

// Every merged group's declared gate and hints on main. Runtime membership checks remain
// inside the selected source option and are tested through its real service boundary.

const allScopes = withScopePrerequisites([
  ...new Set(GROUPS.flatMap(group => group.scopes)),
] as ApiScope[])
type Caller = { id: string; roles: readonly string[]; membership_plan: 'pro' | null }
const pro: Caller = {
  id: '00000000-0000-4000-8000-000000000001',
  roles: [],
  membership_plan: 'pro',
}
const free: Caller = { ...pro, membership_plan: null }
const call = (target: string, option: string, args: object) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: target, arguments: { option, arguments: args } },
})
const planned = (target: string, option: string, args: object, user = pro, scopes = allScopes) =>
  planMcpCalls(call(target, option, args), user, scopes, USER_MCP_SERVER_CONFIG)

function invalid(target: string, input: Record<string, unknown>) {
  const tool = getRegisteredToolByName(target)
  expect(tool).toBeDefined()
  expect(validateToolArguments(tool!.schema.parameters, input)).not.toBeNull()
  const plan = planMcpCalls(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: target, arguments: input } },
    pro,
    allScopes,
    USER_MCP_SERVER_CONFIG,
  )

  const selected = tool!.meta?.auditOption?.(input) ?? null
  expect(plan.events[0]).toEqual({
    jsonrpcMethod: 'tools/call',
    toolName: target,
    outcome: 'invalid_arguments',
    ...(selected === null ? {} : { option: selected }),
  })
  expect(plan.charges).toEqual([])
  return plan.events[0]?.outcome
}

describe('all merged user MCP options', () => {
  it.each(GROUPS)('preserves declared metadata for $target', group => {
    const tool = getRegisteredToolByName(group.target)
    expect(tool).toBeDefined()
    expect(tool!.meta?.requiredScopes?.mcp).toEqual(group.scopes)
    expect(tool!.meta?.plan ?? 'free').toBe(group.plan)
    expect(tool!.meta?.annotations).toEqual(group.annotations)
    expect(tool!.roles === undefined || tool!.roles.user === true).toBe(true)
    expect(tool!.meta?.surfaces).toContain('mcp')
  })

  it.each(CASES)('audits and charges only $target.$option', ({ target, option, args, routes }) => {
    const tool = getRegisteredToolByName(target)
    expect(validateToolArguments(tool!.schema.parameters, { option, arguments: args })).toBeNull()
    const plan = planned(target, option, args)
    expect(plan.events).toEqual([
      { jsonrpcMethod: 'tools/call', toolName: target, option, outcome: 'accepted' },
    ])
    expect(plan.charges).toEqual(
      routes.length ? [{ eventIndex: 0, requestId: 1, routeKeys: routes }] : [],
    )
  })

  it.each(CASES)(
    'keeps $target.$option scope denial option-specific and uncharged',
    ({ target, option, args }) => {
      const plan = planned(target, option, args, pro, [])
      expect(plan.events).toEqual([
        { jsonrpcMethod: 'tools/call', toolName: target, option, outcome: 'insufficient_scope' },
      ])
      expect(plan.charges).toEqual([])
    },
  )

  it.each(CASES.filter(row => GROUPS.find(group => group.target === row.target)?.plan === 'plus'))(
    'keeps $target.$option plan denial option-specific and uncharged',
    ({ target, option, args }) => {
      const plan = planned(target, option, args, free, allScopes)
      expect(plan.events).toEqual([
        { jsonrpcMethod: 'tools/call', toolName: target, option, outcome: 'plan_denied' },
      ])
      expect(plan.charges).toEqual([])
    },
  )

  it.each(CASES)(
    'rejects malformed $target.$option combinations before charging',
    ({ target, option, args }) => {
      expect(invalid(target, { option, arguments: args, extra: true })).toBe('invalid_arguments')
      expect(invalid(target, { option, arguments: { ...args, extra: true } })).toBe(
        'invalid_arguments',
      )
      expect(invalid(target, { option: 'not_an_option', arguments: args })).toBe(
        'invalid_arguments',
      )
      expect(invalid(target, { option })).toBe('invalid_arguments')
    },
  )

  it.each(INCOMPATIBLE)(
    'rejects $target.$option arguments from another option',
    ({ target, option, args }) => {
      expect(invalid(target, { option, arguments: args })).toBe('invalid_arguments')
    },
  )
})
