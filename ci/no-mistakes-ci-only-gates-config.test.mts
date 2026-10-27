import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type Command = {
  always?: boolean
  command?: string[]
  exclude?: string[]
  fileArgs?: string
  include?: string[]
  name?: string
}

function commands(): Command[] {
  const config = parseYaml(readFileSync(`${repoRoot}/.no-mistakes.yml`, 'utf8')) as {
    checks?: { commands?: Command[] }
  }
  return config.checks?.commands ?? []
}

function find(name: string): Command {
  const found = commands().find(candidate => candidate.name === name)
  if (found === undefined) throw new Error(`missing checks.commands entry ${name}`)
  return found
}

// #3015: impacted-checks lists only these configured commands, so a static gate that CI runs
// but that is not declared here is invisible to local validation planning.
describe('CI-only static gates are listed by impacted-checks', () => {
  it('lists the repository rules (test-source correspondence, size budgets) for every change', () => {
    const entry = find('no-mistakes-rules')

    expect(entry.command).toEqual(['pnpm', 'run', 'no-mistakes'])
    expect([entry.always, entry.fileArgs]).toEqual([true, 'none'])
  })

  it('lists the exact repo Node static checks step (scc complexity, repo file policy)', () => {
    const entry = find('repo-node-static-checks')
    const [node, script, flag, checks] = entry.command ?? []

    expect([node, script, flag, entry.always, entry.fileArgs]).toEqual([
      'node',
      'static-code-analysis/run-node-checks.mts',
      '--checks',
      true,
      'none',
    ])
    expect(checks?.split(',')).toEqual(
      expect.arrayContaining(['scc-complexity', 'repo-file-policy']),
    )
  })

  it('lists the knip production-exports step only for backend production sources', () => {
    const entry = find('knip-production-exports')

    expect(entry.command).toEqual(['pnpm', 'run', 'knip:production-exports'])
    expect(entry.include).toContain('backend/**/*.mts')
    expect(entry.exclude).toEqual(expect.arrayContaining(['**/*.test.mts', '**/test-helpers/**']))
  })

  it('lists the typed Oxlint step with changed TypeScript files appended, never the whole repo', () => {
    const entry = find('oxlint-type-aware')

    expect(entry.command).toEqual(['pnpm', 'exec', 'oxlint', '--type-aware', '--deny-warnings'])
    expect([entry.always, entry.fileArgs]).toEqual([undefined, 'append'])
    expect(entry.include).toEqual(['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'])
  })
})
