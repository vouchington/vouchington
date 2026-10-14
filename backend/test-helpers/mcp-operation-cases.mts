import userFixtures from './merged-user-options.json' with { type: 'json' }
import { createUniqueTestEmail } from './data.mts'
import { ALL_TOOLS } from '../mcp/registry/index.mts'
import { userMergedReadingGroups } from '../mcp/registry/user-merged-reading-tools.mts'
import { userMergedParticipationGroups } from '../mcp/registry/user-merged-participation-tools.mts'
import { userMergedAccountGroups } from '../mcp/registry/user-merged-account-tools.mts'
import { adminMergedGroups } from '../mcp/registry/admin-merged-tools.mts'
import { listToolsForSurface, isToolMcpEligible } from '../mcp/registry/select.mts'
import { toolRouteKeys } from '../services/mcp-tools/tool-route-keys.mts'
import { validateToolArguments } from '../services/mcp-tools/validate-tool-arguments.mts'
import type { Tool } from '../services/openai-agents/tool-types.mts'

type Surface = 'mcp' | 'admin_mcp'
export type OperationCase = {
  surface: Surface
  name: string
  option: string | null
  input: Record<string, unknown>
  routes: string[]
}
const UUID = '00000000-0000-4000-8000-000000000001'

function sample(schema: Record<string, unknown>, root = schema, depth = 0): unknown {
  if (depth > 12) throw new Error('schema sampler recursion exceeded')
  if (typeof schema['$ref'] === 'string') {
    const ref = schema['$ref']
    if (!ref.startsWith('#/$defs/')) throw new Error(`Unsupported schema ref ${ref}`)
    const defs = root['$defs'] as Record<string, Record<string, unknown>>
    return sample(defs[ref.slice('#/$defs/'.length)]!, root, depth + 1)
  }
  if (schema['const'] !== undefined) return schema['const']
  if (Array.isArray(schema['enum'])) return schema['enum'][0]
  for (const key of ['oneOf', 'anyOf'] as const) {
    const branches = schema[key] as Record<string, unknown>[] | undefined
    if (branches) {
      const branch = branches.find(item => item['type'] !== 'null') ?? branches[0]!
      return sample(branch, root, depth + 1)
    }
  }
  if (Array.isArray(schema['allOf'])) {
    const entries = (schema['allOf'] as Record<string, unknown>[]).map(item =>
      sample(item, root, depth + 1),
    )
    return Object.assign({}, ...entries)
  }
  if (schema['type'] === 'string') {
    if (schema['format'] === 'uuid') return UUID
    if (schema['format'] === 'date-time') return '2026-01-01T00:00:00.000Z'
    if (schema['format'] === 'date') return '2026-01-01'
    if (schema['format'] === 'email') return createUniqueTestEmail('mcp-operation')
    if (schema['format'] === 'uri' || schema['format'] === 'url') return 'https://example.com/test'
    const min = typeof schema['minLength'] === 'number' ? schema['minLength'] : 1
    const max = typeof schema['maxLength'] === 'number' ? schema['maxLength'] : Math.max(min, 16)
    return 'synthetic'.slice(0, max).padEnd(Math.min(min, max), 'x')
  }
  if (schema['type'] === 'integer' || schema['type'] === 'number')
    return typeof schema['minimum'] === 'number' ? schema['minimum'] : 1
  if (schema['type'] === 'boolean') return true
  if (schema['type'] === 'array') {
    const count = typeof schema['minItems'] === 'number' ? schema['minItems'] : 0
    return Array.from({ length: count }, () =>
      sample(schema['items'] as Record<string, unknown>, root, depth + 1),
    )
  }
  const properties = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>
  const required = [...((schema['required'] ?? []) as string[])]
  const minimum = typeof schema['minProperties'] === 'number' ? schema['minProperties'] : 0
  for (const key of Object.keys(properties)) {
    if (required.length >= minimum) break
    if (!required.includes(key)) required.push(key)
  }
  return Object.fromEntries(required.map(key => [key, sample(properties[key]!, root, depth + 1)]))
}

function validSample(tool: Tool): Record<string, unknown> {
  const parameters = tool.schema.parameters as Record<string, unknown>
  const input =
    tool.schema.name === 'get_domain_ratings'
      ? { hostname: 'example.com' }
      : (sample(parameters) as Record<string, unknown>)
  const violation = validateToolArguments(parameters, input)
  if (violation) throw new Error(`${tool.schema.name}: generated sample invalid: ${violation}`)
  return input
}

const userGroups = [
  ...userMergedReadingGroups,
  ...userMergedParticipationGroups,
  ...userMergedAccountGroups,
]
const userMergedNames = new Set(userGroups.map(group => group.name))
const adminMergedNames = new Set(adminMergedGroups.map(group => group.name))
const userFixtureKeys = new Set(userFixtures.cases.map(row => `${row.target}.${row.option}`))

function mergedUserCases(): OperationCase[] {
  const keys = userGroups.flatMap(group =>
    group.options.map(entry => `${group.name}.${entry.option}`),
  )
  if (
    keys.length !== 71 ||
    userFixtures.cases.length !== 76 ||
    userFixtureKeys.size !== 71 ||
    keys.some(key => !userFixtureKeys.has(key)) ||
    [...userFixtureKeys].some(key => !keys.includes(key))
  ) {
    throw new Error('user merged option fixture differs from current source groups')
  }
  // Five fixture rows intentionally test selector variants of existing options.
  return userFixtures.cases.map(row => {
    const tool = ALL_TOOLS.find(candidate => candidate.schema.name === row.target)!
    const input = { option: row.option, arguments: row.args }
    const violation = validateToolArguments(tool.schema.parameters, input)
    if (violation) throw new Error(`${row.target}.${row.option}: ${violation}`)
    return {
      surface: 'mcp' as const,
      name: row.target,
      option: row.option,
      input,
      routes: row.routes,
    }
  })
}

function mergedAdminCases(): OperationCase[] {
  return adminMergedGroups.flatMap(group =>
    group.options.map(entry => {
      const source = entry.source as Tool
      const args = validSample(source)
      const tool = ALL_TOOLS.find(candidate => candidate.schema.name === group.name)!
      const input = { option: entry.option, arguments: args }
      const violation = validateToolArguments(tool.schema.parameters, input)
      if (violation) throw new Error(`${group.name}.${entry.option}: ${violation}`)
      return {
        surface: 'admin_mcp' as const,
        name: group.name,
        option: entry.option,
        input,
        routes: toolRouteKeys(source.meta, args),
      }
    }),
  )
}

function singleCases(surface: Surface, mergedNames: ReadonlySet<string>): OperationCase[] {
  return listToolsForSurface(surface, ALL_TOOLS).flatMap(tool => {
    if (!isToolMcpEligible(tool) || mergedNames.has(tool.schema.name)) return []
    const input = validSample(tool)
    return [
      {
        surface,
        name: tool.schema.name,
        option: null,
        input,
        routes: toolRouteKeys(tool.meta, input),
      },
    ]
  })
}

export function currentOperationCases(): OperationCase[] {
  const user = [...mergedUserCases(), ...singleCases('mcp', userMergedNames)]
  const admin = [...mergedAdminCases(), ...singleCases('admin_mcp', adminMergedNames)]
  if (user.length !== 120 || admin.length !== 105)
    throw new Error(`case count: ${user.length}/${admin.length}`)
  if (
    new Set(user.map(row => `${row.name}.${row.option ?? ''}`)).size !== 115 ||
    new Set(admin.map(row => `${row.name}.${row.option ?? ''}`)).size !== 105
  )
    throw new Error('distinct operation inventory drift')
  for (const [surface, rows] of [
    ['mcp', user],
    ['admin_mcp', admin],
  ] as const) {
    const actualNames = listToolsForSurface(surface, ALL_TOOLS)
      .flatMap(tool => (isToolMcpEligible(tool) ? [tool.schema.name] : []))
      .toSorted()
    const coveredNames = [...new Set(rows.map(row => row.name))].toSorted()
    if (JSON.stringify(actualNames) !== JSON.stringify(coveredNames))
      throw new Error(`${surface} tool inventory drift`)
    for (const row of rows) {
      const tool = ALL_TOOLS.find(candidate => candidate.schema.name === row.name)!
      if ((tool.meta?.auditOption?.(row.input) ?? null) !== row.option)
        throw new Error(`${row.name}.${row.option ?? 'single'} audit option drift`)
    }
  }
  return [...user, ...admin]
}
