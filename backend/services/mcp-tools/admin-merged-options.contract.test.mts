import { describe, expect, it } from 'vitest'
import { SCOPE_DEFINITIONS, withScopePrerequisites, type ApiScope } from '@modules/scopes'
import { adminMergedGroups, replacedAdminToolNames } from '@voucha/mcp/registry/admin-merged-tools'
import { ALL_TOOLS, getRegisteredToolByName } from '@voucha/mcp/registry/index'
import { ADMIN_MCP_SERVER_CONFIG, ALL_MCP_SERVER_CONFIGS } from './config.mts'
import { planMcpCalls } from './classify-calls.mts'
import { listMcpToolsForUser } from './list-tools.mts'
import { toRouteKey } from './tool-route-keys.mts'
import { validateToolArguments } from './validate-tool-arguments.mts'

const UUID = '00000000-0000-4000-8000-000000000001'
const copyrightTargetContracts = {
  review_copyright_email_intake: { kind: 'email_intake', field: 'intake_id' },
  review_copyright_email_correspondence: { kind: 'email_intake', field: 'intake_id' },
  replay_copyright_intent: { kind: 'notice', field: 'id' },
} as const

function sampleString(schema: Record<string, unknown>): string {
  if (schema['format'] === 'uuid') return UUID
  if (Array.isArray(schema['enum'])) return String(schema['enum'][0])
  const min = typeof schema['minLength'] === 'number' ? schema['minLength'] : 1
  const max = typeof schema['maxLength'] === 'number' ? schema['maxLength'] : Math.max(min, 16)
  return 'synthetic-value'.slice(0, max).padEnd(Math.min(min, max), 'x')
}

function sample(schema: Record<string, unknown>, root: Record<string, unknown>): unknown {
  if (typeof schema['$ref'] === 'string') {
    const defs = root['$defs'] as Record<string, Record<string, unknown>>
    return sample(defs[schema['$ref'].slice('#/$defs/'.length)]!, root)
  }
  if (Array.isArray(schema['enum'])) return schema['enum'][0]
  if (schema['const'] !== undefined) return schema['const']
  const branches = schema['anyOf'] as Record<string, unknown>[] | undefined
  if (branches) {
    const branch = branches.find(item => item['type'] !== 'null') ?? branches[0]!
    return sample(branch, root)
  }
  if (schema['type'] === 'string') return sampleString(schema)
  if (schema['type'] === 'integer' || schema['type'] === 'number') {
    return typeof schema['minimum'] === 'number' ? schema['minimum'] : 1
  }
  if (schema['type'] === 'boolean') return true
  if (schema['type'] === 'array') {
    const count = typeof schema['minItems'] === 'number' ? schema['minItems'] : 0
    return Array.from({ length: count }, () =>
      sample(schema['items'] as Record<string, unknown>, root),
    )
  }
  const properties = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>
  const required = (schema['required'] ?? []) as string[]
  return Object.fromEntries(required.map(key => [key, sample(properties[key]!, root)]))
}

const cases = adminMergedGroups.flatMap(group =>
  group.options.map(entry => {
    const parameters = entry.source.schema.parameters as Record<string, unknown>
    const args = sample(parameters, parameters) as Record<string, unknown>
    // A source whose arguments pick among its REST routes charges only the route they select.
    const routes = entry.source.meta?.selectApi?.(args) ?? entry.source.meta?.api ?? []
    return {
      target: group.name,
      option: entry.option,
      args,
      routes: routes.map(toRouteKey),
      switched: entry.source.meta?.switch === 'copyright.mcpDecisionTools',
    }
  }),
)
const incompatible = cases.flatMap(entry => {
  const parameters = getRegisteredToolByName(entry.target)!.schema.parameters
  const sibling = cases.find(
    other =>
      other.target === entry.target &&
      other.option !== entry.option &&
      validateToolArguments(parameters, { option: entry.option, arguments: other.args }) !== null,
  )
  return sibling ? [{ target: entry.target, option: entry.option, args: sibling.args }] : []
})
const scopes = withScopePrerequisites([
  ...new Set(cases.flatMap(entry => getRegisteredToolByName(entry.target)!.meta!.requiredScopes!)),
])
const administrator = {
  id: UUID,
  roles: ['administrator'],
  membership_plan: null,
}
const staff = { ...administrator, roles: ['staff'] }
const call = (target: string, option: string, args: object) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: target, arguments: { option, arguments: args } },
})
const configFor = (name: string) =>
  ALL_MCP_SERVER_CONFIGS.find(
    config => config.audience === getRegisteredToolByName(name)?.meta?.audience,
  )!
const planned = (
  target: string,
  option: string,
  args: object,
  user = administrator,
  granted: readonly ApiScope[] = scopes,
  enabled = true,
) => planMcpCalls(call(target, option, args), user, granted, configFor(target), enabled)

function invalid(target: string, input: Record<string, unknown>) {
  const tool = getRegisteredToolByName(target)
  expect(tool).toBeDefined()
  expect(validateToolArguments(tool!.schema.parameters, input)).not.toBeNull()
  const plan = planMcpCalls(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: target, arguments: input } },
    administrator,
    scopes,
    configFor(target),
    true,
  )
  const selected = tool!.meta?.auditOption?.(input) ?? null
  expect(plan.events[0]).toEqual({
    jsonrpcMethod: 'tools/call',
    toolName: target,
    outcome: 'invalid_arguments',
    ...(selected === null ? {} : { option: selected }),
  })
  expect(plan.events[0]).not.toHaveProperty('copyrightRationale')
  expect(plan.charges).toEqual([])
  return plan.events[0]?.outcome
}

describe('all merged admin MCP options', () => {
  it('registers 53 admin tools and drops every replaced name', () => {
    const adminTools = ALL_TOOLS.filter(tool => tool.meta?.audience === 'admin')
    expect(adminTools).toHaveLength(53)
    expect(adminMergedGroups).toHaveLength(27)
    expect(replacedAdminToolNames.size).toBe(58)
    for (const name of replacedAdminToolNames) expect(getRegisteredToolByName(name)).toBeUndefined()
    for (const group of adminMergedGroups) expect(getRegisteredToolByName(group.name)).toBeDefined()
  })

  it('lists every admin tool for an all-authorized grant and only moderation reads for Reviewer', () => {
    const allAdminScopes = Object.keys(SCOPE_DEFINITIONS).filter(
      scope => SCOPE_DEFINITIONS[scope as ApiScope].audience === 'admin',
    ) as ApiScope[]
    const listed = listMcpToolsForUser(administrator, allAdminScopes, ADMIN_MCP_SERVER_CONFIG, true)
    expect(listed.map(tool => tool.name).toSorted()).toEqual(
      ALL_TOOLS.filter(tool => tool.meta?.audience === 'admin')
        .map(tool => tool.schema.name)
        .toSorted(),
    )
    const reviewer = listMcpToolsForUser(
      administrator,
      ['moderation:read'],
      ADMIN_MCP_SERVER_CONFIG,
      true,
    ).map(tool => tool.name)
    expect(reviewer).toContain('read_moderation_appeal')
    expect(reviewer).toContain('read_user_moderation')
    expect(reviewer).not.toContain('set_user_suspension')
    expect(reviewer).not.toContain('read_crawler')
    expect(reviewer.every(name => !replacedAdminToolNames.has(name))).toBe(true)
  })

  it.each(cases)('audits and charges only $target.$option', ({ target, option, args, routes }) => {
    const tool = getRegisteredToolByName(target)
    expect(validateToolArguments(tool!.schema.parameters, { option, arguments: args })).toBeNull()
    const plan = planned(target, option, args)
    const targetContract = copyrightTargetContracts[target as keyof typeof copyrightTargetContracts]
    const rationale =
      typeof args['rationale'] === 'string' && tool!.meta?.auditRationale
        ? args['rationale']
        : undefined
    expect(plan.events).toEqual([
      {
        jsonrpcMethod: 'tools/call',
        toolName: target,
        option,
        outcome: 'accepted',
        ...(rationale === undefined ? {} : { copyrightRationale: rationale }),
        ...(rationale !== undefined && targetContract
          ? { copyrightTarget: { kind: targetContract.kind, id: args[targetContract.field] } }
          : {}),
      },
    ])
    expect(plan.charges).toEqual(
      routes.length
        ? [{ eventIndex: 0, requestId: 1, routeCharges: [{ routeKeys: routes, weight: 1 }] }]
        : [],
    )
  })

  it.each(cases)(
    'keeps $target.$option scope and staff-role denials uncharged',
    ({ target, option, args }) => {
      expect(planned(target, option, args, administrator, []).events).toEqual([
        { jsonrpcMethod: 'tools/call', toolName: target, option, outcome: 'insufficient_scope' },
      ])
      expect(planned(target, option, args, administrator, []).charges).toEqual([])
      expect(planned(target, option, args, staff).events).toEqual([
        { jsonrpcMethod: 'tools/call', toolName: target, option, outcome: 'role_denied' },
      ])
      expect(planned(target, option, args, staff).charges).toEqual([])
    },
  )

  it.each(cases.filter(entry => entry.switched))(
    'hides $target.$option and its rationale while copyright decisions are off',
    ({ target, option, args }) => {
      const plan = planned(target, option, args, administrator, scopes, false)
      expect(plan.events).toEqual([
        { jsonrpcMethod: 'tools/call', toolName: null, outcome: 'not_found' },
      ])
      expect(JSON.stringify(plan.events)).not.toContain(String(args['rationale']))
      expect(plan.charges).toEqual([])
    },
  )

  it.each(cases)(
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

  it.each(incompatible)(
    'rejects $target.$option arguments from another option',
    ({ target, option, args }) => {
      expect(invalid(target, { option, arguments: args })).toBe('invalid_arguments')
    },
  )
})
