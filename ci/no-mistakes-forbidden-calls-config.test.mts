import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type ForbiddenCallsRule = {
  exclude?: unknown
  include?: string[]
  name: string
  options?: unknown
  rule: string
  scope?: string
}

const pollTargets = [
  { global: 'setInterval' },
  { global: 'setImmediate' },
  { moduleExport: { module: 'node:timers', export: 'setInterval' } },
  { moduleExport: { module: 'node:timers', export: 'setImmediate' } },
  { moduleExport: { module: 'node:timers/promises', export: 'setInterval' } },
  { moduleExport: { module: 'node:timers/promises', export: 'setImmediate' } },
  { exact: 'vi.waitFor' },
  { exact: 'vi.waitUntil' },
  { exact: 'expect.poll' },
  { function: { file: 'backend/test-helpers/polling.mts', symbol: 'waitForCondition' } },
  {
    function: {
      file: 'backend/test-helpers/polling.mts',
      symbol: 'waitForConditionThenObliterate',
    },
  },
  { function: { file: 'backend/test-helpers/polling.mts', symbol: 'pollUntilNotNull' } },
  { function: { file: 'backend/test-helpers/polling.mts', symbol: 'waitForQueueJobs' } },
]

function withoutBaseline(rule: ForbiddenCallsRule): Omit<ForbiddenCallsRule, 'exclude'> {
  const { exclude: _exclude, ...rest } = rule
  return rest
}

describe('no-mistakes forbidden-calls config', () => {
  it('applies the general analyzer repeatedly across test layers', () => {
    const source = readFileSync(`${repoRoot}/.no-mistakes.yml`, 'utf8')
    const config = parseYaml(source) as { rules: ForbiddenCallsRule[] }
    const rules = config.rules.filter(candidate => candidate.rule === 'forbidden-calls')
    const byName = new Map(rules.map(rule => [rule.name, rule]))
    const rule = (name: string): ForbiddenCallsRule => {
      const found = byName.get(name)
      if (found === undefined) throw new Error(`missing forbidden-calls rule ${name}`)
      return found
    }

    expect(rules.map(candidate => candidate.name)).toEqual([
      'Only canonical API routes may start an SSE response',
      'Durable app-owned IDs in creation paths use UUIDv7',
      'Tests use the shared database',
      'Vitest tests do not invoke real timers',
      'Playwright tests do not invoke fixed sleeps',
      'Vitest tests do not poll or wait on timers',
      'Test helpers and vitest setup do not invoke real timers or polls',
      'Playwright tests do not poll on timers',
      'Vitest tests do not assert benchmarks',
      'Vitest tests do not run live no-mistakes analysis',
      'Vitest tests do not load the live workflow topology',
      'Vitest tests do not generate the full PostgreSQL schema snapshot',
      'integration tests do not call mock helpers',
    ])

    expect(
      rules.filter(candidate => candidate.exclude !== undefined).map(candidate => candidate.name),
    ).toEqual([
      'Only canonical API routes may start an SSE response',
      'Vitest tests do not poll or wait on timers',
      'Test helpers and vitest setup do not invoke real timers or polls',
    ])
    for (const candidate of rules) {
      if (candidate.exclude === undefined) continue
      expect(candidate.exclude).toEqual(expect.arrayContaining([expect.any(String)]))
    }

    expect(withoutBaseline(rule('Vitest tests do not invoke real timers'))).toEqual({
      name: 'Vitest tests do not invoke real timers',
      rule: 'forbidden-calls',
      scope: 'repository',
      options: {
        roots: [{ vitest: true }],
        traversal: 'file',
        unknownCalls: 'ignore',
        targets: [
          { global: 'setTimeout' },
          { moduleExport: { module: 'node:timers', export: 'setTimeout' } },
          { moduleExport: { module: 'node:timers/promises', export: 'setTimeout' } },
        ],
      },
    })
    expect(withoutBaseline(rule('Playwright tests do not invoke fixed sleeps'))).toEqual({
      name: 'Playwright tests do not invoke fixed sleeps',
      rule: 'forbidden-calls',
      scope: 'repository',
      options: {
        roots: [{ playwright: true }],
        traversal: 'file',
        unknownCalls: 'ignore',
        targets: [
          { global: 'setTimeout' },
          { terminal: 'waitForTimeout' },
          { moduleExport: { module: 'node:timers', export: 'setTimeout' } },
          { moduleExport: { module: 'node:timers/promises', export: 'setTimeout' } },
        ],
      },
    })
    expect(withoutBaseline(rule('Vitest tests do not poll or wait on timers'))).toEqual({
      name: 'Vitest tests do not poll or wait on timers',
      rule: 'forbidden-calls',
      scope: 'repository',
      options: {
        roots: [{ vitest: true }],
        traversal: 'file',
        unknownCalls: 'ignore',
        targets: pollTargets,
      },
    })
    expect(
      withoutBaseline(rule('Test helpers and vitest setup do not invoke real timers or polls')),
    ).toEqual({
      name: 'Test helpers and vitest setup do not invoke real timers or polls',
      rule: 'forbidden-calls',
      scope: 'repository',
      options: {
        roots: [
          {
            glob: [
              'test-helpers/**/*.mts',
              'test-helpers/**/*.ts',
              '**/test-helpers/**/*.mts',
              '**/test-helpers/**/*.ts',
              '**/vitest.setup*.mts',
              '**/vitest.setup*.ts',
            ],
          },
        ],
        traversal: 'file',
        unknownCalls: 'ignore',
        targets: [
          { global: 'setTimeout' },
          { global: 'setInterval' },
          { global: 'setImmediate' },
          { moduleExport: { module: 'node:timers', export: 'setTimeout' } },
          { moduleExport: { module: 'node:timers', export: 'setInterval' } },
          { moduleExport: { module: 'node:timers', export: 'setImmediate' } },
          { moduleExport: { module: 'node:timers/promises', export: 'setTimeout' } },
          { moduleExport: { module: 'node:timers/promises', export: 'setInterval' } },
          { moduleExport: { module: 'node:timers/promises', export: 'setImmediate' } },
          ...pollTargets.slice(6),
        ],
      },
    })
    expect(withoutBaseline(rule('Playwright tests do not poll on timers'))).toEqual({
      name: 'Playwright tests do not poll on timers',
      rule: 'forbidden-calls',
      scope: 'repository',
      options: {
        roots: [{ playwright: true }],
        traversal: 'file',
        unknownCalls: 'ignore',
        targets: pollTargets.slice(0, 6),
      },
    })
    expect(withoutBaseline(rule('Vitest tests do not assert benchmarks'))).toEqual({
      name: 'Vitest tests do not assert benchmarks',
      rule: 'forbidden-calls',
      scope: 'repository',
      options: {
        roots: [{ vitest: true }],
        traversal: 'file',
        unknownCalls: 'ignore',
        targets: [{ exact: 'performance.now' }, { exact: 'process.memoryUsage' }],
      },
    })
    expect(rule('Vitest tests do not run live no-mistakes analysis')).toEqual({
      name: 'Vitest tests do not run live no-mistakes analysis',
      rule: 'forbidden-calls',
      scope: 'repository',
      options: {
        roots: [{ vitest: true }],
        excludeRoots: ['static-code-analysis/i18n-extract/route-selector-map.mock.test.mts'],
        traversal: 'transitive',
        unknownCalls: 'ignore',
        targets: [
          ...[
            'analyzeProject',
            'analyzeTypeScriptModules',
            'check',
            'ciTopology',
            'ciTopologyImpact',
            'dependencies',
            'importUsages',
            'resolveCheck',
            'symbols',
            'testsPlan',
            'validateMermaidMarkdown',
          ].map(name => ({ moduleExport: { module: 'no-mistakes', export: name } })),
        ],
      },
    })
    expect(rule('Vitest tests do not load the live workflow topology')).toEqual({
      name: 'Vitest tests do not load the live workflow topology',
      rule: 'forbidden-calls',
      scope: 'repository',
      options: {
        roots: [{ vitest: true }],
        traversal: 'file',
        unknownCalls: 'ignore',
        targets: [{ function: { file: 'ci/repo-topology.mts', symbol: 'loadRepoTopology' } }],
      },
    })
    expect(rule('Vitest tests do not generate the full PostgreSQL schema snapshot')).toEqual({
      name: 'Vitest tests do not generate the full PostgreSQL schema snapshot',
      rule: 'forbidden-calls',
      scope: 'repository',
      options: {
        roots: [{ vitest: true }],
        traversal: 'transitive',
        unknownCalls: 'ignore',
        targets: [
          {
            function: {
              file: 'backend/data-stores/psql/schema-snapshot/generate.mts',
              symbol: 'generateSchemaSnapshot',
            },
          },
        ],
      },
    })
    expect(withoutBaseline(rule('integration tests do not call mock helpers'))).toEqual({
      name: 'integration tests do not call mock helpers',
      rule: 'forbidden-calls',
      scope: 'repository',
      include: ['integration-tests/**/*.mts'],
      options: {
        roots: [{ vitest: true }],
        traversal: 'file',
        unknownCalls: 'ignore',
        targets: [
          { exact: 'vi.mock' },
          { exact: 'vi.doMock' },
          { exact: 'vi.importMock' },
          { exact: 'vi.fn' },
          { exact: 'vi.spyOn' },
          { exact: 'vi.stubGlobal' },
          { exact: 'jest.mock' },
          { exact: 'jest.doMock' },
        ],
      },
    })
  })
})
