import { participationWriteGroups } from '@voucha/mcp/registry/participation-write-groups'
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { Tool } from '@services/openai-agents/tool-types'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { adminMergedGroups } from '@voucha/mcp/registry/admin-merged-tools'
import { userMergedAccountGroups } from '@voucha/mcp/registry/user-merged-account-tools'
import { userMergedParticipationGroups } from '@voucha/mcp/registry/user-merged-participation-tools'
import { userMergedReadingGroups } from '@voucha/mcp/registry/user-merged-reading-tools'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { listMcpToolsForUser } from './list-tools.mts'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from './config.mts'

type BaselineRecord = {
  surface: 'mcp' | 'admin_mcp'
  method: string
  path: string
  facts: {
    scopes: string[]
    roles: string[] | null
    plan: string | null
    annotations: Record<string, unknown>
  }
  operation: { tool: string; option: string | null }
  decision: boolean
  inputFields: string[][]
  requestBodyFields: string[] | null
}
const baselineData = JSON.parse(
  readFileSync(new URL('../../test-helpers/mcp-route-baseline.json', import.meta.url), 'utf8'),
) as {
  facts: Record<string, BaselineRecord['facts']>
  inputs: Record<string, string[][]>
  routes: Record<
    string,
    (Omit<BaselineRecord, 'method' | 'path' | 'facts' | 'inputFields'> & {
      facts: string
      inputFields: string
    })[]
  >
  additions: Record<
    string,
    {
      pullRequest: number
      contracts: (Omit<BaselineRecord, 'method' | 'path' | 'facts' | 'inputFields'> & {
        facts: string
        inputFields: string
      })[]
    }
  >
}
const baseline = {
  records: Object.entries(baselineData.routes).flatMap(([route, records]) =>
    records.map(record => ({
      ...record,
      facts: baselineData.facts[record.facts]!,
      inputFields: baselineData.inputs[record.inputFields]!,
      method: route.slice(0, route.indexOf(':')),
      path: route.slice(route.indexOf(':') + 1),
    })),
  ),
}
const additions = Object.entries(baselineData.additions).flatMap(([route, addition]) =>
  addition.contracts.map(record => ({
    ...record,
    facts: baselineData.facts[record.facts]!,
    inputFields: baselineData.inputs[record.inputFields]!,
    method: route.slice(0, route.indexOf(':')),
    path: route.slice(route.indexOf(':') + 1),
  })),
)
const expectedRecords = [...baseline.records, ...additions]
const requestContracts = JSON.parse(
  readFileSync(new URL('../../../api-fixtures/v1/request-contracts.json', import.meta.url), 'utf8'),
) as { operations: Record<string, { body?: unknown }>; components: Record<string, unknown> }

type RouteSource = Pick<Tool, 'roles' | 'meta'> & { schema: Pick<Tool['schema'], 'parameters'> }
type SourceEntry = { publicName: string; option: string | null; source: RouteSource }
const mergedGroups = [
  ...participationWriteGroups,
  ...userMergedReadingGroups,
  ...userMergedParticipationGroups,
  ...userMergedAccountGroups,
  ...adminMergedGroups,
]
const mergedNames = new Set(mergedGroups.map(group => group.name))
const sourceEntries: SourceEntry[] = [
  ...ALL_TOOLS.filter(tool => !mergedNames.has(tool.schema.name)).map(source => ({
    publicName: source.schema.name,
    option: null,
    source,
  })),
  ...mergedGroups.flatMap(group =>
    group.options.map(({ option, source }) => ({ publicName: group.name, option, source })),
  ),
]
const normalizePath = (path: string) => path.replace(/\{([^}]+)\}/g, ':$1')
const sorted = (values: string[]) => values.toSorted()
function inputFields(parameters: Record<string, unknown> | null): string[][] {
  const branches = parameters?.['oneOf']
  if (Array.isArray(branches)) {
    return branches
      .map(branch => sorted(Object.keys((branch as { properties?: object }).properties ?? {})))
      .toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  return [sorted(Object.keys((parameters?.['properties'] as object | undefined) ?? {}))]
}
function restBodyFields(schema: unknown, seen = new Set<string>()): string[] | null {
  if (schema === undefined || schema === null) return null
  if (typeof schema !== 'object') return []
  const value = schema as Record<string, unknown>
  if (typeof value['$ref'] === 'string') {
    const reference = value['$ref']
    if (seen.has(reference)) return []
    const name = reference.replace('#/components/schemas/', '')
    return restBodyFields(requestContracts.components[name], new Set([...seen, reference]))
  }
  const own = Object.keys((value['properties'] as object | undefined) ?? {})
  const branches = ['allOf', 'anyOf', 'oneOf'].flatMap(key =>
    Array.isArray(value[key]) ? (value[key] as unknown[]) : [],
  )
  const branchFields = branches.flatMap(branch => restBodyFields(branch, seen) ?? [])
  return sorted([...new Set([...own, ...branchFields])])
}
function facts(source: RouteSource, surface: 'mcp' | 'admin_mcp') {
  const roles = source.roles
  return {
    scopes: sorted([...(source.meta?.requiredScopes?.[surface] ?? [])]),
    roles:
      roles === undefined || roles.user === true
        ? null
        : sorted(Object.keys(roles).filter(role => roles[role] === true)),
    plan: surface === 'mcp' ? (source.meta?.plan ?? 'free') : null,
    annotations: source.meta?.annotations?.readOnlyHint
      ? { ...source.meta.annotations, idempotentHint: true }
      : (source.meta?.annotations ?? {}),
  }
}
function currentRecords(): Array<{
  surface: 'mcp' | 'admin_mcp'
  method: string
  path: string
  facts: ReturnType<typeof facts>
  inputFields: string[][]
  restRequestSchemaFields: string[] | null
  publicName: string
  option: string | null
  decision: boolean
}> {
  return sourceEntries.flatMap(({ publicName, option, source }) =>
    (source.meta?.surfaces ?? []).flatMap(surface => {
      if (surface !== 'mcp' && surface !== 'admin_mcp') return []
      return (source.meta?.api ?? []).map(({ method, path }) => {
        const normalizedPath = normalizePath(path)
        const operation = requestContracts.operations[`${method}:${normalizedPath}`]
        return {
          surface,
          method,
          path: normalizedPath,
          facts: facts(source, surface),
          inputFields: inputFields(source.schema.parameters),
          restRequestSchemaFields: restBodyFields(operation?.body),
          publicName,
          option,
          decision: source.meta?.switch === 'copyright.mcpDecisionTools',
        }
      })
    }),
  )
}
const sameContract = (left: BaselineRecord, right: ReturnType<typeof currentRecords>[number]) =>
  left.operation.tool === right.publicName &&
  left.operation.option === right.option &&
  left.decision === right.decision &&
  left.surface === right.surface &&
  left.method === right.method &&
  left.path === right.path &&
  isDeepStrictEqual(left.facts, right.facts) &&
  (left.method === 'GET' || isDeepStrictEqual(left.inputFields, right.inputFields))

describe('MCP route completeness from baseline facts', () => {
  it('requires PR provenance for each explicitly added route contract', () => {
    for (const addition of Object.values(baselineData.additions)) {
      expect(Number.isInteger(addition.pullRequest) && addition.pullRequest > 0).toBe(true)
      expect(addition.contracts.length).toBeGreaterThan(0)
    }
  })

  it('subtracts only copyright decision options when the switch is off', () => {
    const roles = [...new Set(ALL_TOOLS.flatMap(tool => Object.keys(tool.roles ?? {})))]
    const user = { id: 'route-completeness', roles, membership_plan: 'pro' as const }
    const scopes = Object.keys(SCOPE_DEFINITIONS) as ApiScope[]
    for (const config of [USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG]) {
      const off = listMcpToolsForUser(user, scopes, config, false)
      const on = listMcpToolsForUser(user, scopes, config, true)
      const switched = [
        ...new Set(
          expectedRecords
            .filter(record => record.surface === config.surface && record.decision)
            .map(record => record.operation.tool),
        ),
      ]
      expect(on.filter(tool => !switched.includes(tool.name))).toEqual(off)
      expect(
        on
          .filter(tool => switched.includes(tool.name))
          .map(tool => tool.name)
          .toSorted(),
      ).toEqual(switched.toSorted())
      for (const entry of sourceEntries.filter(entry =>
        entry.source.meta?.surfaces.includes(config.surface),
      )) {
        const published = on.find(tool => tool.name === entry.publicName)
        expect(published).toBeDefined()
        expect(published!['_meta']!['voucha/requiredScopes'].toSorted()).toEqual(
          facts(entry.source, config.surface).scopes,
        )
        expect(published!.annotations).toEqual(facts(entry.source, config.surface).annotations)
      }
    }
  })
  it('maps every baseline route contract to exactly one current source option', () => {
    const current = currentRecords()
    const matches = expectedRecords.map(expected =>
      current.filter(actual => sameContract(expected, actual)),
    )
    const unmatched = expectedRecords.flatMap((expected, index) =>
      matches[index]!.length === 1
        ? []
        : [
            {
              expected,
              candidates: current.filter(
                actual =>
                  expected.surface === actual.surface &&
                  expected.method === actual.method &&
                  expected.path === actual.path,
              ),
            },
          ],
    )
    expect(unmatched).toEqual([])

    const currentMatches = new Map<string, number>()
    for (const entries of matches)
      for (const actual of entries) {
        const key = JSON.stringify([
          actual.surface,
          actual.publicName,
          actual.option,
          actual.method,
          actual.path,
        ])
        currentMatches.set(key, (currentMatches.get(key) ?? 0) + 1)
      }
    expect([...currentMatches.values()].filter(count => count !== 1)).toEqual([])
    expect(
      current.filter(actual => !expectedRecords.some(expected => sameContract(expected, actual))),
    ).toEqual([])
  })

  it('keeps pinned REST-twin body fields accepted by the current REST contract', () => {
    const current = currentRecords()
    for (const expected of baseline.records.filter(record => record.requestBodyFields !== null)) {
      const actual = current.find(
        record =>
          record.surface === expected.surface &&
          record.method === expected.method &&
          record.path === expected.path,
      )
      expect(actual).toBeDefined()
      const allowed = actual?.restRequestSchemaFields ?? []
      expect(expected.requestBodyFields!.filter(field => !allowed.includes(field))).toEqual([])
    }
  })

  it('retains baseline GET query and selector fields', () => {
    const current = currentRecords()
    for (const expected of baseline.records.filter(record => record.method === 'GET')) {
      const actual = current.find(candidate => sameContract(expected, candidate))!
      for (const fields of expected.inputFields) {
        expect(
          actual.inputFields.some(branch => fields.every(field => branch.includes(field))),
        ).toBe(true)
      }
    }
  })

  it('has no duplicate contracts across the baseline, additions, or current source', () => {
    const identity = (
      entry: Pick<BaselineRecord, 'surface' | 'method' | 'path' | 'facts' | 'inputFields'>,
    ) => JSON.stringify([entry.surface, entry.method, entry.path, entry.facts, entry.inputFields])
    const baselineKeys = expectedRecords.map(identity)
    const currentKeys = currentRecords().map(identity)
    expect(new Set(baselineKeys).size).toBe(baselineKeys.length)
    expect(new Set(currentKeys).size).toBe(currentKeys.length)
  })
})
