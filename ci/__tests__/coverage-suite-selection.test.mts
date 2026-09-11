import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import picomatch from 'picomatch'
import { afterAll, describe, expect, it } from 'vitest'
import { localCoverageToolingProjectNames } from '../../test-helpers/vitest-config/tooling-project-registry.mts'

import { zeroThresholdGlobs } from '../coverage-check-gate.mts'
import {
  selectionDiagnosticLines,
  suiteFailureReproductionLines,
} from '../coverage-local-affected-output.mts'
import {
  affectedSuites,
  suiteCoverageCommand,
  SUITES,
  UNINSTRUMENTED_LOCAL_COVERAGE_GLOBS,
} from '../coverage-suites-local.mts'

describe('SUITES sourcePatterns', () => {
  it('every suite has at least one sourcePattern', () => {
    const missing = SUITES.filter(s => s.sourcePatterns.length === 0).map(s => s.name)
    expect(missing).toEqual([])
  })
})

describe('affectedSuites mapping', () => {
  it('maps ts-shared files to ts-shared', () => {
    const { suites } = affectedSuites(['ts-shared/foo.ts'])
    expect(suites.map(s => s.name)).toContain('ts-shared')
  })

  it('maps backend/modules files to both backend-modules and backend-data-stores', () => {
    const { suites } = affectedSuites(['backend/modules/foo.ts'])
    const names = suites.map(s => s.name)
    expect(names).toContain('backend-modules')
    expect(names).toContain('backend-data-stores')
  })

  it('maps web/lib/api files to both web and web-integration', () => {
    const { suites } = affectedSuites(['web/lib/api/foo.ts'])
    const names = suites.map(s => s.name)
    expect(names).toContain('web')
    expect(names).toContain('web-integration')
  })

  it('maps web/components files to both web and web-storybook', () => {
    const { suites } = affectedSuites(['web/components/Button.tsx'])
    const names = suites.map(s => s.name)
    expect(names).toContain('web')
    expect(names).toContain('web-storybook')
  })

  it('maps lambdas files to lambdas only', () => {
    const { suites } = affectedSuites(['lambdas/foo.ts'])
    expect(suites.map(s => s.name)).toContain('lambdas')
  })

  it('maps cloudflare-worker files to cloudflare-worker only', () => {
    const { suites } = affectedSuites(['cloudflare-worker/foo.ts'])
    expect(suites.map(s => s.name)).toContain('cloudflare-worker')
  })

  it('maps email-templates files to backend-modules', () => {
    const { suites } = affectedSuites(['email-templates/foo.ts'])
    expect(suites.map(s => s.name)).toContain('backend-modules')
  })

  it('maps production sources owned by no-data mocks to backend-modules', () => {
    for (const path of [
      'backend/services/captcha/verify.mts',
      'backend/services/fediverse-search/adapters/lemmy.mts',
      'backend/data-stores/valkey-glide-mq/glide-mq-factory.mts',
    ]) {
      const names = affectedSuites([path]).suites.map(suite => suite.name)
      expect(names).toContain('backend-modules')
      expect(names).toContain('backend-data-stores')
    }
  })

  it('maps ci/ files to tooling', () => {
    const { suites } = affectedSuites(['ci/foo.test.mts'])
    expect(suites.map(s => s.name)).toContain('tooling')
  })

  it('maps Playwright helper files exclusively to the Playwright helper suite', () => {
    const { suites } = affectedSuites(['playwright/helpers/auth.mts'])

    expect(suites.map(s => s.name)).toEqual(['playwright-helpers'])
  })

  it('separates root setup and docs inputs from uncovered source files', () => {
    const { suites, unmapped, uninstrumented } = affectedSuites([
      'test-helpers/vitest.setup.dynamic-config-isolation.mts',
      'docs/development/tests.md',
      '.agents/skills/agent-workflow/implementation.md',
    ])

    expect(suites).toHaveLength(0)
    expect(unmapped).toEqual([])
    expect(uninstrumented).toEqual([
      'test-helpers/vitest.setup.dynamic-config-isolation.mts',
      'docs/development/tests.md',
      '.agents/skills/agent-workflow/implementation.md',
    ])
  })

  it('keeps matching suite selection for uninstrumented setup files under suite prefixes', () => {
    const { suites, unmapped, uninstrumented } = affectedSuites([
      'web/test-helpers/vitest.setup.web.mts',
    ])

    expect(suites.map(s => s.name)).toEqual(['web'])
    expect(unmapped).toEqual([])
    expect(uninstrumented).toEqual(['web/test-helpers/vitest.setup.web.mts'])
  })

  it('preserves SUITES declaration order in result', () => {
    const { suites } = affectedSuites(['ts-shared/a.ts', 'web/b.ts', 'lambdas/c.ts'])
    const names = suites.map(s => s.name)
    const expectedOrder = SUITES.map(s => s.name).filter(n => names.includes(n))
    expect(names).toEqual(expectedOrder)
  })
})

describe('coverage-rules guard: every enforced glob maps to a local suite', () => {
  it('maps every enforced .coverage-rules.yml glob through affectedSuites', () => {
    const rulesText = readFileSync('.coverage-rules.yml', 'utf8')
    const config = load(rulesText) as {
      rules?: Array<{ paths?: string; patch_coverage_min?: number }>
    }
    type RuleEntry = { paths: string; min: number }
    const rules: RuleEntry[] = (config.rules ?? []).flatMap(r =>
      r.paths && typeof r.patch_coverage_min === 'number'
        ? [{ paths: r.paths, min: r.patch_coverage_min }]
        : [],
    )

    const enforced = rules.filter(r => r.min > 0)
    expect(enforced.length).toBeGreaterThan(0) // sanity: rules file is not empty

    // A representative file one level under the glob root.
    function representative(glob: string): string {
      return glob.replace(/\*\*/g, 'example/file.ts').replace(/\*/g, 'file.ts')
    }

    // Accumulate violations — avoid conditional expect inside loops (no-conditional-expect).
    const suiteViolations: string[] = []

    for (const rule of enforced) {
      const file = representative(rule.paths)
      const { suites } = affectedSuites([file])

      if (suites.length === 0) {
        suiteViolations.push(
          `"${rule.paths}" (min=${rule.min}) has no matching suite for "${file}" — add sourcePatterns`,
        )
      }
    }

    expect(suiteViolations).toEqual([])
  })
})

describe('zeroThresholdGlobs', () => {
  let tmpDir: string
  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns zero-threshold globs from a rules file', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'coverage-gate-test-'))
    const rulesPath = join(tmpDir, 'rules.yml')
    writeFileSync(
      rulesPath,
      'rules:\n  - paths: "uncovered/**"\n    patch_coverage_min: 0\n  - paths: "backend/**"\n    patch_coverage_min: 80\n',
    )
    expect(zeroThresholdGlobs(rulesPath)).toEqual(['uncovered/**'])
  })

  it('returns [] for a missing file', () => {
    expect(zeroThresholdGlobs('/nonexistent/path/rules.yml')).toEqual([])
  })

  it('returns [] for malformed YAML', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'coverage-gate-test-'))
    const rulesPath = join(tmpDir, 'bad.yml')
    writeFileSync(rulesPath, ': invalid: yaml: {{{')
    expect(zeroThresholdGlobs(rulesPath)).toEqual([])
  })
})

describe('UNINSTRUMENTED_LOCAL_COVERAGE_GLOBS', () => {
  it('matches representative setup and Markdown inputs', () => {
    const isUninstrumented = picomatch(UNINSTRUMENTED_LOCAL_COVERAGE_GLOBS, { dot: true })

    expect(isUninstrumented('backend/test-helpers/vitest.setup.aws-mocks.mts')).toBe(true)
    expect(isUninstrumented('test-helpers/vitest.setup.dynamic-config-isolation.mts')).toBe(true)
    expect(isUninstrumented('docs/development/tests.md')).toBe(true)
    expect(isUninstrumented('.agents/skills/agent-workflow/implementation.md')).toBe(true)
    expect(isUninstrumented('backend/services/users/user.mts')).toBe(false)
  })
})

describe('affected coverage diagnostic output', () => {
  it('prints uninstrumented setup/docs inputs separately from uncovered source', () => {
    expect(
      selectionDiagnosticLines({
        notVerified: [],
        trulyUnmapped: ['unknown/source.mts'],
        uninstrumented: ['test-helpers/vitest.setup.dynamic-config-isolation.mts'],
      }),
    ).toEqual([
      'Note: the following changed files are setup/docs inputs and are not instrumented by local patch coverage:',
      '  test-helpers/vitest.setup.dynamic-config-isolation.mts',
      'Authoritative coverage command for code changes: pnpm run coverage:patch:full',
      '',
      'Note: the following changed files do not match any local Vitest suite:',
      '  unknown/source.mts',
      'These files have no local coverage. The gate below will fail.',
      'Consider adding sourcePatterns in ci/coverage-suites-local.mts.',
      '',
    ])
  })

  it('prints the single failed suite command before the affected retry', () => {
    const suite = SUITES.find(s => s.name === 'tooling')
    expect(suite).toBeDefined()
    const projectArgs = localCoverageToolingProjectNames
      .map(project => `--project ${project}`)
      .join(' ')

    expect(
      suiteFailureReproductionLines(suite!, 'coverage-affected', 'origin/main', 'HEAD'),
    ).toEqual([
      '',
      'Reproduce the failed suite only:',
      `  VITEST_COVERAGE_SCOPE=tooling pnpm exec vitest run ${projectArgs} --coverage --coverage.all=true --coverage.reportsDirectory=coverage-affected/tooling`,
      'After that passes, rerun the affected coverage pre-check:',
      '  pnpm run coverage:patch:affected -- --base origin/main --head HEAD',
    ])
  })

  it('quotes reproduction command arguments that contain spaces', () => {
    const suite = SUITES.find(s => s.name === 'tooling')
    expect(suite).toBeDefined()
    const projectArgs = localCoverageToolingProjectNames
      .map(project => `--project ${project}`)
      .join(' ')

    expect(suiteCoverageCommand(suite!, '/tmp/OneDrive - Company/coverage affected').command).toBe(
      `pnpm exec vitest run ${projectArgs} --coverage --coverage.all=true '--coverage.reportsDirectory=/tmp/OneDrive - Company/coverage affected/tooling'`,
    )
  })
})
