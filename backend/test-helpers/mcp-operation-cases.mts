import type { ApiScope } from '../modules/scopes/index.mts'
import { communityModerationGroups } from '../mcp/community-moderation-tools.mts'
import { participationWriteGroups } from '../mcp/registry/participation-write-groups.mts'
import userFixtures from './merged-user-options.json' with { type: 'json' }
import { sampleMcpToolArguments } from './mcp-operation-sample.mts'
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
  scopes?: readonly ApiScope[]
}

const userGroups = [
  ...userMergedReadingGroups,
  ...userMergedParticipationGroups,
  ...userMergedAccountGroups,
]
const userMergedNames = new Set(
  [...userGroups, ...participationWriteGroups, ...communityModerationGroups].map(
    group => group.name,
  ),
)
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
      const args = sampleMcpToolArguments(source)
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

function communityModerationCases(): OperationCase[] {
  const cases = communityModerationGroups.flatMap(group =>
    group.options.map(entry => {
      const source = entry.source
      const args = sampleMcpToolArguments({
        schema: { name: group.name, parameters: source.schema.parameters },
      })
      const tool = ALL_TOOLS.find(candidate => candidate.schema.name === group.name)!
      const input = { option: entry.option, arguments: args }
      const violation = validateToolArguments(tool.schema.parameters, input)
      if (violation) throw new Error(`${group.name}.${entry.option}: ${violation}`)
      const scopes: ApiScope[] =
        group.name === 'read_community_moderation'
          ? ['community-moderation:read']
          : ['community-moderation:read', 'community-moderation:write']
      return {
        surface: 'mcp' as const,
        name: group.name,
        option: entry.option,
        input,
        routes: toolRouteKeys(source.meta, args),
        scopes,
      }
    }),
  )
  if (cases.length !== 54) throw new Error('community moderation option inventory drift')
  return cases
}

function singleCases(surface: Surface, mergedNames: ReadonlySet<string>): OperationCase[] {
  return listToolsForSurface(surface, ALL_TOOLS).flatMap(tool => {
    if (!isToolMcpEligible(tool) || mergedNames.has(tool.schema.name)) return []
    const input = sampleMcpToolArguments(tool)
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
  const participation = participationWriteGroups.flatMap(group =>
    group.options.map(entry => {
      const args = sampleMcpToolArguments(entry.source as Tool)
      const tool = ALL_TOOLS.find(candidate => candidate.schema.name === group.name)!
      const input = { option: entry.option, arguments: args }
      const violation = validateToolArguments(tool.schema.parameters, input)
      if (violation) throw new Error(`${group.name}.${entry.option}: ${violation}`)
      return {
        surface: 'mcp' as const,
        name: group.name,
        option: entry.option,
        input,
        routes: toolRouteKeys(entry.source.meta, args),
      }
    }),
  )
  const user = [
    ...mergedUserCases(),
    ...participation,
    ...communityModerationCases(),
    ...singleCases('mcp', userMergedNames),
  ]
  const admin = [...mergedAdminCases(), ...singleCases('admin_mcp', adminMergedNames)]
  if (user.length !== 194 || admin.length !== 106)
    throw new Error(`case count: ${user.length}/${admin.length}`)
  if (
    new Set(user.map(row => `${row.name}.${row.option ?? ''}`)).size !== 189 ||
    new Set(admin.map(row => `${row.name}.${row.option ?? ''}`)).size !== 106
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
