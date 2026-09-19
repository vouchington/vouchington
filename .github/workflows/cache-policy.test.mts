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

  it('does not cache package directories or Playwright browser installs', () => {
    for (const path of yamlPaths) {
      const source = readFileSync(path, 'utf8')
      for (const block of cachePathBlocks(source)) {
        expect(block).not.toMatch(/(^|\s)(?:~\/)?\.pnpm-store\b/)
        expect(block).not.toContain('~/.local/share/pnpm')
        expect(block).not.toContain('~/.npm')
        expect(block).not.toContain('~/.cache/yarn')
        expect(block).not.toContain('~/.yarn/cache')
        expect(block).not.toMatch(/(^|[\s/'"`{}])node_modules\b/)
        expect(block).not.toContain('ms-playwright')
      }
    }
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

  it('never restores or saves the Vite transform cache via actions/cache on a self-hosted job', () => {
    // Self-hosted runners already persist .cache/vite/vitest across runs via
    // ./.github/actions/clean-workspace (it excludes .cache from `git clean`), so a
    // remote actions/cache round-trip there is pure overhead with zero benefit — it
    // once consumed a job's entire 10-minute budget. Only cold-start ephemeral
    // runners, with no persisted local state, may still use
    // actions/cache for this path — none currently do: tests-web.yml's web-tests
    // and tests-backend-modules.yml's backend-modules jobs relocated to self-hosted.
    const violations: string[] = []

    for (const file of workflowFileNames) {
      const path = join('.github/workflows', file)
      const workflow = load(readFileSync(path, 'utf8')) as CacheWorkflow

      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        if (!isSelfHostedRunsOn(job['runs-on'])) continue

        for (const step of job.steps ?? []) {
          const usesCacheRestoreOrSave =
            step.uses?.startsWith('actions/cache@') ||
            step.uses?.startsWith('actions/cache/restore@') ||
            step.uses?.startsWith('actions/cache/save@')
          if (!usesCacheRestoreOrSave) continue
          if (!withPathContainsViteVitestCache(step.with)) continue

          violations.push(
            `${file}#${jobId}: step "${step.name ?? step.uses}" uses ${step.uses} to ` +
              `restore/save .cache/vite/vitest on a self-hosted runner. Self-hosted runners ` +
              `already persist .cache/ across runs via ./.github/actions/clean-workspace — ` +
              `delete this actions/cache step instead of adding it back. See ` +
              `.github/workflows/RUNNERS.md for the current policy.`,
          )
        }
      }
    }

    assertNoWorkflowViolations(
      violations,
      'Self-hosted jobs must not use actions/cache for .cache/vite/vitest:',
    )
  })
})
