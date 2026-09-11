import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  TOOLING_DEPENDENCY_CRUISER_ROOTS,
  buildToolingDependencyCruiserArgs,
  parseToolingDependencyCruiserCliArgs,
  runToolingDependencyCruiser,
} from '../run-tooling-dependency-cruiser.mts'

type DependencyCruiserRule = {
  from?: { path?: string }
}

type DependencyCruiserConfig = {
  forbidden: DependencyCruiserRule[]
}

const require = createRequire(import.meta.url)
const dependencyCruiserConfig = require('../../.dependency-cruiser.cjs') as DependencyCruiserConfig

describe('tooling dependency-cruiser runner', () => {
  it('owns every repo-tooling source root', () => {
    expect(TOOLING_DEPENDENCY_CRUISER_ROOTS).toEqual([
      'ci',
      'dev/agent-issue-labels',
      'dev/pr-description.mts',
      'dev/pr-description',
      'static-code-analysis',
    ])
  })

  it('builds deterministic local and content-cache arguments', () => {
    expect(buildToolingDependencyCruiserArgs({ cache: false })).toEqual([
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'err',
      ...TOOLING_DEPENDENCY_CRUISER_ROOTS,
    ])
    expect(buildToolingDependencyCruiserArgs({ cache: true })).toEqual([
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'err',
      '--cache',
      '--cache-strategy',
      'content',
      ...TOOLING_DEPENDENCY_CRUISER_ROOTS,
    ])
  })

  it('rejects unsupported command-line arguments', () => {
    expect(parseToolingDependencyCruiserCliArgs([])).toEqual({ cache: false })
    expect(parseToolingDependencyCruiserCliArgs(['--cache'])).toEqual({ cache: true })
    expect(() => parseToolingDependencyCruiserCliArgs(['--unknown'])).toThrow(
      'Unknown tooling dependency-cruiser argument: --unknown',
    )
  })

  it('executes dependency-cruiser without a shell', () => {
    let invocation: unknown
    const exitCode = runToolingDependencyCruiser(['--cache'], (command, args, options) => {
      invocation = { command, args, options }
      return { status: 0 }
    })

    expect(exitCode).toBe(0)
    expect(invocation).toEqual({
      command: 'pnpm',
      args: ['exec', 'depcruise', ...buildToolingDependencyCruiserArgs({ cache: true })],
      options: { shell: false, stdio: 'inherit' },
    })
  })

  it('keeps every declared root in scope for at least one configured boundary', () => {
    const representativePaths = [
      'ci/example.mts',
      'dev/agent-issue-labels/example.mts',
      'dev/pr-description.mts',
      'dev/pr-description/example.mts',
      'static-code-analysis/example.mts',
    ]
    const configuredFromPatterns = dependencyCruiserConfig.forbidden.flatMap(rule =>
      rule.from?.path ? [new RegExp(rule.from.path)] : [],
    )

    for (const path of representativePaths) {
      expect(configuredFromPatterns.some(pattern => pattern.test(path))).toBe(true)
    }
  })

  it('makes package, workflow, and ci-local callers invoke the same runner', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    const workflow = readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')
    const ciLocalTargets = readFileSync('ci/ci-local/targets.mts', 'utf8')
    const command = 'node static-code-analysis/run-tooling-dependency-cruiser.mts'

    expect(packageJson.scripts['dep-cruise:scripts']).toContain(command)
    expect(workflow).toContain(`${command} --cache`)
    expect(ciLocalTargets).toContain(command)
    expect(workflow).not.toContain(
      'ci dev/agent-issue-labels dev/pr-description.mts dev/pr-description static-code-analysis',
    )
    expect(ciLocalTargets).not.toContain(
      'ci dev/agent-issue-labels dev/pr-description.mts dev/pr-description static-code-analysis',
    )
  })
})
