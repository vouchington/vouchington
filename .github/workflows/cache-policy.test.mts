import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { assertNoWorkflowViolations, type WorkflowStep } from './workflow-test-helpers.mts'

type CacheStep = WorkflowStep & { with?: Record<string, unknown> }

type CacheWorkflow = {
  jobs?: Record<
    string,
    {
      'runs-on'?: string | string[]
      steps?: CacheStep[]
    }
  >
}

type CompositeAction = {
  runs?: {
    using?: string
    steps?: CacheStep[]
  }
}

const workflowFileNames = readdirSync('.github/workflows').filter(
  file => file.endsWith('.yml') || file.endsWith('.yaml'),
)

const yamlPaths = [
  ...readdirSync('.github/workflows').map(file => join('.github/workflows', file)),
  ...readdirSync('.github/actions', { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return []
    const dir = join('.github/actions', entry.name)
    return readdirSync(dir).flatMap(file => (/^action\.ya?ml$/.test(file) ? [join(dir, file)] : []))
  }),
].filter(path => /\.ya?ml$/.test(path))

function cachePathBlocks(source: string): string[] {
  return actionStepBlocks(source, /uses:\s+actions\/cache(?:\/restore|\/save)?@/)
}

function setupNodeBlocks(source: string): string[] {
  return actionStepBlocks(source, /uses:\s+actions\/setup-node@/)
}

function actionStepBlocks(source: string, pattern: RegExp): string[] {
  const blocks: string[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!pattern.test(lines[i]!)) continue
    const inlineStepIndent = lines[i]!.match(/^(\s*)-\s+uses:/)?.[1].length
    const standaloneUsesIndent = lines[i]!.match(/^(\s*)uses:/)?.[1].length
    const stepIndent =
      inlineStepIndent ?? (standaloneUsesIndent != null ? standaloneUsesIndent - 2 : undefined)
    if (stepIndent == null || stepIndent < 0) continue
    const stepStartPattern = new RegExp(`^ {${stepIndent}}- `)
    let start = i
    while (start > 0 && !stepStartPattern.test(lines[start]!)) start--
    let end = i + 1
    while (end < lines.length && !stepStartPattern.test(lines[end]!)) end++
    blocks.push(lines.slice(start, end).join('\n'))
  }
  return blocks
}

// One-level resolution of a local composite action's own steps, so a job
// that delegates its real install work to `./.github/actions/<name>` is
// checked as if those steps were inlined. Only local composites are
// resolved (remote `uses:` refs are left as opaque steps); none of the
// composites this policy cares about nest a second local composite inside
// themselves, so one level is sufficient.
function resolveLocalCompositeSteps(usesRef: string): CacheStep[] {
  const match = usesRef.match(/^\.\/(\.github\/actions\/[^/@]+)/)
  if (!match) return []
  const dir = match[1]!
  for (const filename of ['action.yml', 'action.yaml']) {
    const path = join(dir, filename)
    if (!existsSync(path)) continue
    const action = load(readFileSync(path, 'utf8')) as CompositeAction
    if (action.runs?.using !== 'composite') return []
    return action.runs.steps ?? []
  }
  return []
}

function flattenSteps(steps: CacheStep[]): CacheStep[] {
  return steps.flatMap(step => {
    if (!step.uses?.startsWith('./.github/actions/')) return [step]
    return [step, ...resolveLocalCompositeSteps(step.uses)]
  })
}

function isPnpmInstallStep(step: CacheStep): boolean {
  const run = step.run ?? ''
  return run.includes('ci/pnpm-install.sh') || run.includes('ci/setup-backend-install.sh')
}

function isPlaywrightInstallStep(step: CacheStep): boolean {
  const run = step.run ?? ''
  return (
    run.includes('playwright install') || run.includes('playwright-install-ubicloud-browsers.sh')
  )
}

function isActionsCacheStep(step: CacheStep): boolean {
  return (
    step.uses?.startsWith('actions/cache@') === true ||
    step.uses?.startsWith('actions/cache/restore@') === true ||
    step.uses?.startsWith('actions/cache/save@') === true
  )
}

function cacheStepPath(step: CacheStep): string {
  const path = step.with?.path
  if (typeof path === 'string') return path
  if (Array.isArray(path))
    return path.filter((entry): entry is string => typeof entry === 'string').join('\n')
  return ''
}

function isPnpmStoreCacheStep(step: CacheStep): boolean {
  return isActionsCacheStep(step) && cacheStepPath(step).includes('pnpm-store')
}

function isPlaywrightCacheStep(step: CacheStep): boolean {
  return isActionsCacheStep(step) && cacheStepPath(step).includes('ms-playwright')
}

describe('CI cache policy', () => {
  it('never enables npm package manager caches', () => {
    // actions/setup-node's built-in `cache:` input is banned outright: it
    // cannot be pinned to a commit SHA, it manages its own opaque key
    // scheme, and it cannot cache Playwright browsers. Every job that needs
    // caching uses an explicit, SHA-pinned actions/cache step instead (see
    // 'caches the pnpm store and Playwright browsers at every real install
    // site' below) so the cache key and scope stay under our control.
    for (const path of yamlPaths) {
      const source = readFileSync(path, 'utf8')

      expect(source).not.toMatch(/^\s+cache:\s*['"]?(?:npm|pnpm|yarn)['"]?/m)
      expect(source).not.toContain('pnpm-cache:')
      for (const block of setupNodeBlocks(source)) {
        expect(block).not.toMatch(/^\s+cache:/m)
      }
    }
  })

  it('caches the pnpm store and Playwright browsers at every real install site', () => {
    // No runner persists a warm pnpm store or ~/.cache/ms-playwright across runs
    // anymore, so every real install site needs a preceding actions/cache step or
    // it pays a full cold install every run. Resolves one level of local composite
    // steps so setup-node-pnpm/setup-backend/setup-playwright call sites are
    // checked like standalone/manual install steps.
    const violations: string[] = []

    for (const file of workflowFileNames) {
      const path = join('.github/workflows', file)
      const workflow = load(readFileSync(path, 'utf8')) as CacheWorkflow

      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        const steps = flattenSteps(job.steps ?? [])

        steps.forEach((step, index) => {
          const priorSteps = steps.slice(0, index)

          if (isPnpmInstallStep(step) && !priorSteps.some(isPnpmStoreCacheStep)) {
            violations.push(
              `${file}#${jobId}: step "${step.name ?? 'pnpm install'}" installs pnpm ` +
                `dependencies without a preceding actions/cache step for the pnpm store.`,
            )
          }

          if (isPlaywrightInstallStep(step) && !priorSteps.some(isPlaywrightCacheStep)) {
            violations.push(
              `${file}#${jobId}: step "${step.name ?? 'Playwright install'}" installs ` +
                `Playwright browsers without a preceding actions/cache step for ~/.cache/ms-playwright.`,
            )
          }
        })
      }
    }

    assertNoWorkflowViolations(
      violations,
      'Every pnpm/Playwright install site must be preceded by an actions/cache step:',
    )
  })

  it('disables Docker build record uploads on build and bake actions', () => {
    const buildWebImagesAction = readFileSync('.github/actions/build-web-images/action.yml', 'utf8')
    const buildBackendImagesAction = readFileSync(
      '.github/actions/build-backend-images/action.yml',
      'utf8',
    )
    const explainAnalyzeWorkflow = readFileSync('.github/workflows/explain-analyze.yml', 'utf8')

    expect(buildWebImagesAction).toContain("DOCKER_BUILD_RECORD_UPLOAD: 'false'")
    expect(buildWebImagesAction).toContain("DOCKER_BUILD_SUMMARY: 'false'")
    expect(buildBackendImagesAction).toContain("DOCKER_BUILD_RECORD_UPLOAD: 'false'")
    expect(explainAnalyzeWorkflow).toContain('name: Upload EXPLAIN ANALYZE results')
    expect(explainAnalyzeWorkflow).toContain('if: always()')
  })

  it('deletes inter-job blob artifacts after the tests fan-in consumes them', () => {
    const workflow = readFileSync('.github/workflows/ci-tests-processing.yml', 'utf8')
    const testsJobStart = workflow.indexOf('\n  tests-processing:')
    expect(testsJobStart).toBeGreaterThanOrEqual(0)
    const afterTests = workflow.slice(testsJobStart + 1)
    const nextJobStart = afterTests.search(/\n {2}[a-z][a-z0-9-]*:\n/)
    const testsJob = nextJobStart === -1 ? afterTests : afterTests.slice(0, nextJobStart)

    // The tests job must have actions: write to delete artifacts
    expect(testsJob).toContain('actions: write')
    // The cleanup step must exist and target the inter-job blob prefixes
    expect(testsJob).toContain('name: Delete inter-job blob artifacts')
    expect(testsJob).not.toContain('if: always()')
    expect(testsJob).toContain('id: all-checks-passed')
    expect(testsJob).toContain(
      "if: steps.all-checks-passed.outcome == 'success' && (steps.merge-vitest-reports.outcome == 'success' || steps.merge-vitest-reports.outcome == 'skipped')",
    )
    expect(testsJob).toContain('test("^(vitest-blob-|vitest-report-attempt-|coverage-)")')
    // Cleanup must run after Vitest reports and required-job fan-in are consumed.
    expect(testsJob.indexOf('name: Merge Vitest reports')).toBeLessThan(
      testsJob.indexOf('name: Delete inter-job blob artifacts'),
    )
    expect(testsJob.indexOf('name: All checks passed')).toBeLessThan(
      testsJob.indexOf('name: Delete inter-job blob artifacts'),
    )
  })

  it('keeps binary download paths versioned', () => {
    const setupLychee = readFileSync('.github/actions/setup-lychee/action.yml', 'utf8')
    const setupPlaywright = readFileSync('.github/actions/setup-playwright/action.yml', 'utf8')
    const playwrightInstall = readFileSync('ci/playwright-install-ubicloud-browsers.sh', 'utf8')
    const gitleaks = readFileSync('.github/workflows/gitleaks.yml', 'utf8')

    expect(setupLychee).toContain('--bin-dir "$LYCHEE_BIN_DIR"')
    expect(setupLychee).toContain('LYCHEE_BIN_DIR="${RUNNER_TEMP:-$HOME/.local}/bin"')
    expect(setupPlaywright).toContain('run: ./ci/playwright-install-ubicloud-browsers.sh')
    expect(playwrightInstall).toContain('exec-vouchington-gha.sh')
    expect(
      readFileSync(
        'node_modules/vouchington-tooling/scripts/gha/install-playwright-chromium-arm64.sh',
        'utf8',
      ),
    ).toContain('local tmp="${RUNNER_TEMP:-/tmp}/${name}-${rev}-${archive}"')
    expect(gitleaks).toContain(': "${RUNNER_TEMP:?RUNNER_TEMP must be set by GitHub Actions}"')
    expect(gitleaks).toContain('--bin-dir "$RUNNER_TEMP/bin"')
    expect(gitleaks).not.toContain('${RUNNER_TEMP:-/tmp}')
  })

  it('keys the pnpm-store and Playwright browser caches safely', () => {
    // Every cache step covering the pnpm store or the Playwright browser
    // directory must be scoped by OS/arch (both paths are platform-specific)
    // and keyed on the pnpm lockfile hash (so a dependency bump invalidates
    // it). The Playwright browser cache additionally must never declare
    // restore-keys: unlike the pnpm store (where a stale partial restore
    // just means slower reinstalls of the changed packages), a stale
    // Playwright browser cache is a version mismatch against the pinned
    // `playwright` package -- it must surface as a loud install-time
    // failure, never a silent restore of the wrong browser build.
    const violations: string[] = []

    for (const path of yamlPaths) {
      const source = readFileSync(path, 'utf8')

      for (const block of cachePathBlocks(source)) {
        const isPnpmStore = block.includes('pnpm-store')
        const isPlaywright = block.includes('ms-playwright')
        if (!isPnpmStore && !isPlaywright) continue

        const firstLine = block.trim().split('\n')[0]

        if (!/hashFiles\(\s*['"]pnpm-lock\.yaml['"]\s*\)/.test(block)) {
          violations.push(
            `${path}: cache step "${firstLine}" must key on hashFiles('pnpm-lock.yaml') ` +
              `so a dependency bump invalidates the cache.`,
          )
        }
        if (!block.includes('runner.os') || !block.includes('runner.arch')) {
          violations.push(
            `${path}: cache step "${firstLine}" must scope its key by runner.os and ` +
              `runner.arch (the pnpm store path and Playwright binaries are platform-specific).`,
          )
        }
        if (isPlaywright && /restore-keys:/.test(block)) {
          violations.push(
            `${path}: Playwright browser cache step "${firstLine}" must not declare ` +
              `restore-keys -- a stale/mismatched browser cache must surface as a loud ` +
              `install-time failure, not a silent partial restore.`,
          )
        }
      }
    }

    assertNoWorkflowViolations(violations, 'Cache steps must be keyed safely:')
  })
})
