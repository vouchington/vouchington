import { readdirSync, readFileSync } from 'node:fs'
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

const workflowFileNames = readdirSync('.github/workflows').filter(
  file => file.endsWith('.yml') || file.endsWith('.yaml'),
)

function isSelfHostedRunsOn(runsOn: string | string[] | undefined): boolean {
  const labels = Array.isArray(runsOn) ? runsOn : typeof runsOn === 'string' ? [runsOn] : []
  return labels.some(label => label === 'self-hosted')
}

function withPathContainsViteVitestCache(withBlock: Record<string, unknown> | undefined): boolean {
  const path = withBlock?.path
  if (typeof path === 'string') return path.includes('.cache/vite/vitest')
  if (Array.isArray(path)) {
    return path.some(entry => typeof entry === 'string' && entry.includes('.cache/vite/vitest'))
  }
  return false
}

// Directories a self-hosted runner already persists across runs (via
// ./.github/actions/clean-workspace's `git clean` exclusions), so an actions/cache round-trip for
// any of them is pure overhead with zero benefit there. Hosted runners (ubuntu-latest et al.) start
// every job from a clean disk, so the same round-trip is a real, one-run-behind-of-cold win —
// see .github/workflows/reference-self-hosted-runner-caching.md.
const persistedOnSelfHostedPathLabels: ReadonlyArray<{
  label: string
  test: (path: string) => boolean
}> = [
  { label: '.pnpm-store', test: path => /(^|\s)(?:~\/)?\.pnpm-store\b/.test(path) },
  { label: '~/.local/share/pnpm', test: path => path.includes('~/.local/share/pnpm') },
  { label: '~/.npm', test: path => path.includes('~/.npm') },
  { label: '~/.cache/yarn', test: path => path.includes('~/.cache/yarn') },
  { label: '~/.yarn/cache', test: path => path.includes('~/.yarn/cache') },
  { label: 'node_modules', test: path => /(^|[\s/'"`{}])node_modules\b/.test(path) },
  { label: 'ms-playwright', test: path => path.includes('ms-playwright') },
]

function withPathBannedLabels(withBlock: Record<string, unknown> | undefined): string[] {
  const path = withBlock?.path
  const paths =
    typeof path === 'string'
      ? [path]
      : Array.isArray(path)
        ? path.filter((entry): entry is string => typeof entry === 'string')
        : []
  return paths.flatMap(entry =>
    persistedOnSelfHostedPathLabels.filter(({ test }) => test(entry)).map(({ label }) => label),
  )
}

type CacheActionFile = { runs?: { steps?: CacheStep[] } }

// Maps the local `uses:` reference (e.g. './.github/actions/setup-playwright') to its action.yml
// (or .yaml) path, so a caller found via `selfHostedCallers()` below can be traced back to the
// file that defines it.
const localActionFilesByRef = new Map(
  readdirSync('.github/actions', { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return []
    const dir = join('.github/actions', entry.name)
    const actionFile = readdirSync(dir).find(file => /^action\.ya?ml$/.test(file))
    return actionFile ? [[`./.github/actions/${entry.name}`, join(dir, actionFile)] as const] : []
  }),
)

// A composite action has no `runs-on` of its own — its runner class is whatever job calls it. So
// the ban on caching a self-hosted-persisted path only applies to a composite action when at least
// one of its call sites is a self-hosted job; hosted-only composites are free to cache the same
// paths, same as an inline step in a hosted job.
function selfHostedCallers(): Set<string> {
  const callers = new Set<string>()
  for (const { jobId: _jobId, step } of selfHostedWorkflowSteps()) {
    if (step.uses?.startsWith('./.github/actions/')) callers.add(step.uses)
  }
  return callers
}

function selfHostedWorkflowSteps(): ReadonlyArray<{
  file: string
  jobId: string
  step: CacheStep
}> {
  const results: Array<{ file: string; jobId: string; step: CacheStep }> = []
  for (const file of workflowFileNames) {
    const workflow = load(readFileSync(join('.github/workflows', file), 'utf8')) as CacheWorkflow
    for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
      if (!isSelfHostedRunsOn(job['runs-on'])) continue
      for (const step of job.steps ?? []) results.push({ file, jobId, step })
    }
  }
  return results
}

function isCacheRestoreOrSave(step: CacheStep): boolean {
  return (
    step.uses?.startsWith('actions/cache@') === true ||
    step.uses?.startsWith('actions/cache/restore@') === true ||
    step.uses?.startsWith('actions/cache/save@') === true
  )
}

const yamlPaths = [
  ...readdirSync('.github/workflows').map(file => join('.github/workflows', file)),
  ...readdirSync('.github/actions', { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return []
    const dir = join('.github/actions', entry.name)
    return readdirSync(dir).flatMap(file => (/^action\.ya?ml$/.test(file) ? [join(dir, file)] : []))
  }),
].filter(path => /\.ya?ml$/.test(path))

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

describe('CI cache policy', () => {
  it('never enables npm package manager caches', () => {
    for (const path of yamlPaths) {
      const source = readFileSync(path, 'utf8')

      expect(source).not.toMatch(/^\s+cache:\s*['"]?(?:npm|pnpm|yarn)['"]?/m)
      expect(source).not.toContain('pnpm-cache:')
      for (const block of setupNodeBlocks(source)) {
        expect(block).not.toMatch(/^\s+cache:/m)
      }
    }
  })

  it('does not cache package directories or Playwright browser installs on a self-hosted job', () => {
    // Self-hosted runners already persist these directories locally (pnpm store, node_modules,
    // ~/.cache/ms-playwright) across runs via ./.github/actions/clean-workspace, so an
    // actions/cache round-trip for any of them there is pure overhead with zero benefit — see
    // .github/workflows/reference-self-hosted-runner-caching.md. Hosted runners (ubuntu-latest et
    // al.) have no such local persistence, so the same caching is a real win and is allowed there
    // — .github/workflows/tests-playwright.yml and .github/actions/setup-playwright use it.
    const selfHostedActionCallers = selfHostedCallers()
    const violations: string[] = []

    for (const { file, jobId, step } of selfHostedWorkflowSteps()) {
      if (!isCacheRestoreOrSave(step)) continue
      for (const label of withPathBannedLabels(step.with)) {
        violations.push(
          `${file}#${jobId}: step "${step.name ?? step.uses}" uses ${step.uses} to cache ` +
            `${label} on a self-hosted runner, which already persists it locally`,
        )
      }
    }

    for (const [localRef, actionPath] of localActionFilesByRef) {
      if (!selfHostedActionCallers.has(localRef)) continue
      const action = load(readFileSync(actionPath, 'utf8')) as CacheActionFile
      for (const step of action.runs?.steps ?? []) {
        if (!isCacheRestoreOrSave(step)) continue
        for (const label of withPathBannedLabels(step.with)) {
          violations.push(
            `${actionPath}: step "${step.name ?? step.uses}" uses ${step.uses} to cache ` +
              `${label}, but ${localRef} is called from a self-hosted job, which already ` +
              `persists it locally`,
          )
        }
      }
    }

    assertNoWorkflowViolations(
      violations,
      'Self-hosted jobs (directly or via a composite action) must not use actions/cache for ' +
        'directories that already persist locally:',
    )
  })

  it('disables Docker build record uploads on build and bake actions', () => {
    const buildWebWorkflow = readFileSync('.github/workflows/build-web.yml', 'utf8')
    const buildBackendWorkflow = readFileSync('.github/workflows/build-backend.yml', 'utf8')
    const explainAnalyzeWorkflow = readFileSync('.github/workflows/explain-analyze.yml', 'utf8')

    expect(buildWebWorkflow).toContain("DOCKER_BUILD_RECORD_UPLOAD: 'false'")
    expect(buildWebWorkflow).toContain("DOCKER_BUILD_SUMMARY: 'false'")
    expect(buildBackendWorkflow).toContain("DOCKER_BUILD_RECORD_UPLOAD: 'false'")
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
      "if: steps.all-checks-passed.outcome == 'success' && (steps.merge-vitest-reports.outcome == 'success' || steps.merge-vitest-reports.outcome == 'skipped') && inputs.skip-ci-producers != 'true'",
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

  it('never restores or saves the Vite transform cache via actions/cache on a self-hosted job', () => {
    // Self-hosted runners already persist .cache/vite/vitest across runs via
    // ./.github/actions/clean-workspace (it excludes .cache from `git clean`), so a
    // remote actions/cache round-trip there is pure overhead with zero benefit — it
    // once consumed a job's entire 10-minute budget. Only cold-start ephemeral
    // (Ubicloud) runners, with no persisted local state, may still use
    // actions/cache for this path — none currently do: tests-web.yml's web-tests
    // and tests-backend-modules.yml's backend-modules jobs relocated to self-hosted.
    const violations = selfHostedWorkflowSteps()
      .filter(
        ({ step }) => isCacheRestoreOrSave(step) && withPathContainsViteVitestCache(step.with),
      )
      .map(
        ({ file, jobId, step }) =>
          `${file}#${jobId}: step "${step.name ?? step.uses}" uses ${step.uses} to ` +
          `restore/save .cache/vite/vitest on a self-hosted runner. Self-hosted runners ` +
          `already persist .cache/ across runs via ./.github/actions/clean-workspace — ` +
          `delete this actions/cache step instead of adding it back. See ` +
          `.github/workflows/RUNNERS.md for the current policy.`,
      )

    assertNoWorkflowViolations(
      violations,
      'Self-hosted jobs must not use actions/cache for .cache/vite/vitest:',
    )
  })
})
