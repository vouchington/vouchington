import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { isPackageScriptBuildLockStep } from './build-lock-pnpm-resolution.mts'

type WorkflowStep = {
  'timeout-minutes'?: number
  run?: string
  uses?: string
  'working-directory'?: string
}
type RunDefaults = { run?: { 'working-directory'?: string } }
type WorkflowJob = { 'timeout-minutes'?: number; steps?: WorkflowStep[]; defaults?: RunDefaults }
type WorkflowFile = { jobs?: Record<string, WorkflowJob>; defaults?: RunDefaults }
type CompositeActionFile = { runs?: { steps?: WorkflowStep[] } }

// GitHub Actions resolves a `run:` step's working directory from exactly three places, most to
// least specific: the step's own `working-directory`, `jobs.<id>.defaults.run.working-directory`,
// and top-level `defaults.run.working-directory` (@chatgpt-codex-connector, PR #11084). Composite
// actions have no `defaults` key in the schema, so this only applies to workflow job steps.
function effectiveJobWorkingDirectory(workflow: WorkflowFile, job: WorkflowJob): string {
  return (
    job.defaults?.run?.['working-directory'] ?? workflow.defaults?.run?.['working-directory'] ?? '.'
  )
}

const MIN_BUILD_LOCK_STEP_TIMEOUT_MINUTES = 8
const MAX_DIRECT_BUILD_LOCK_STEP_TIMEOUT_MINUTES = 12
const STRICT_NEXT_BUILD_STEP_TIMEOUT_MINUTES = 13

// Returns a human-readable violation reason, or null when the step's timeout-minutes
// sits inside the backstop band. Kept as its own predicate (rather than inlined into
// an it.each body) so it has synthetic-fixture unit coverage that runs regardless of
// how many real consumers the discovery scans below happen to find today.
function backstopBandViolation(step: WorkflowStep): string | null {
  // yaml.parse is untyped at runtime: a quoted `timeout-minutes: "12"` or an
  // unresolved `${{ ... }}` expression both surface as a string here, and a
  // relational comparison against a string either coerces or NaN-compares false,
  // silently letting an out-of-band value pass as in-band.
  const timeout: unknown = step['timeout-minutes']
  if (typeof timeout !== 'number' || Number.isNaN(timeout)) return 'missing timeout-minutes'
  if (
    timeout < MIN_BUILD_LOCK_STEP_TIMEOUT_MINUTES ||
    timeout > MAX_DIRECT_BUILD_LOCK_STEP_TIMEOUT_MINUTES
  ) {
    return `timeout-minutes ${timeout} outside the ${MIN_BUILD_LOCK_STEP_TIMEOUT_MINUTES}-${MAX_DIRECT_BUILD_LOCK_STEP_TIMEOUT_MINUTES} backstop band`
  }
  return null
}

// These four jobs only reach ci/with-build-lock.sh indirectly, through the package
// script called by the build-web-targets composite action. Composite-action `run:`
// steps cannot carry their own `timeout-minutes` (enforced below by the composite-action
// discovery scan, which requires zero build-lock `run:` steps there for exactly this
// reason), so nothing in these jobs matches the `run`-based filter used by the workflow
// discovery scan — their only relevant step is the outer
// `uses: ./.github/actions/build-web-targets` step, which is timeout-capped instead
// and is asserted as the strict Next backstop below. `checks-static.yml#static-web`
// joined this group when it switched from a literal `run: pnpm run build` step to the
// shared composite (#10990) — it is no longer a direct workflow consumer.
const compositeOnlyBuildLockJobs = [
  ['checks-static.yml', 'static-web'],
  ['tests-web-integration.yml', 'web-integration-tests'],
  ['tests-playwright.yml', 'playwright-tests'],
  ['tests-playwright-credentialed.yml', 'playwright-credentialed-tests'],
] as const
const strictNextBuildJobs = compositeOnlyBuildLockJobs

function workflowJob(
  file: string,
  jobName: string,
): { job: WorkflowJob; workingDirectory: string } {
  const workflow = load(readFileSync(`.github/workflows/${file}`, 'utf8')) as WorkflowFile
  const job = workflow.jobs?.[jobName]
  if (!job) throw new Error(`Missing workflow job: ${file}#${jobName}`)
  return { job, workingDirectory: effectiveJobWorkingDirectory(workflow, job) }
}

// Matches a literal `run: ... with-build-lock ...` invocation, or a package-script step whose
// target ultimately routes through with-build-lock.sh (see build-lock-pnpm-resolution.mts, and
// its own test file for the pnpm-invocation-parsing and script-forwarding coverage) — this is what
// closes the gap where an indirect consumer like checks-static.yml's
// `working-directory: web` + `run: pnpm run build` step would otherwise be invisible to a
// literal-only scan. A script invoked further removed from any YAML `run:` step (a composite
// action that spawns pnpm as a child process from a .mts script, e.g. build-web-targets/action.yml
// -> ci/setup-web-integration.mts) has no `run:` text to scan at all and stays out of scope — see
// compositeOnlyBuildLockJobs above and heavy-slot-coverage.test.mts for the "who may consume the
// wrapper" registry.
function buildLockSteps(job: WorkflowJob, inheritedWorkingDirectory = '.'): WorkflowStep[] {
  return (job.steps ?? []).filter(
    step =>
      step.run?.includes('with-build-lock') === true ||
      isPackageScriptBuildLockStep(step, inheritedWorkingDirectory),
  )
}

type BuildLockConsumer = { location: string; step: WorkflowStep }

// Discovers every workflow `run:` step that invokes ci/with-build-lock.sh, rather than
// relying on a hand-maintained list. PR #10362 (native client extraction) removed the
// seven jobs that used to call the wrapper directly and left behind an empty
// hand-maintained array instead of replacing the invariant it was meant to enforce — a
// discovery scan cannot go stale the same way.
function directWorkflowBuildLockConsumers(): BuildLockConsumer[] {
  return readdirSync('.github/workflows')
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
    .flatMap(file => {
      const workflow = load(readFileSync(`.github/workflows/${file}`, 'utf8')) as WorkflowFile
      return Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
        buildLockSteps(job, effectiveJobWorkingDirectory(workflow, job)).map(step => ({
          location: `${file}#${jobName}`,
          step,
        })),
      )
    })
    .toSorted((left, right) => left.location.localeCompare(right.location))
}

// Recurses so a composite action nested below an intermediate directory (e.g.
// .github/actions/group/nested/action.yml) is not invisible to the scan below —
// see the dedicated recursion-fixture test.
function actionYamlPaths(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return actionYamlPaths(path)
    return entry.name === 'action.yml' || entry.name === 'action.yaml' ? [path] : []
  })
}

// Composite-action `run:` steps cannot carry their own `timeout-minutes`, so a with-build-lock.sh
// call added inside a composite action — whether a literal `run:` invocation or a package-script
// step like setup-backend/action.yml's `working-directory: email-templates` + `run: pnpm run
// build` — would be both invisible to a literal-only scan and uncappable. Reuses
// isPackageScriptBuildLockStep so a composite action gets the same package-script resolution as a
// workflow job step (@chatgpt-codex-connector, PR #11084).
function compositeActionBuildLockConsumers(): BuildLockConsumer[] {
  return actionYamlPaths('.github/actions')
    .flatMap(path => {
      const action = load(readFileSync(path, 'utf8')) as CompositeActionFile
      return (action.runs?.steps ?? [])
        .filter(
          step =>
            step.run?.includes('with-build-lock') === true || isPackageScriptBuildLockStep(step),
        )
        .map(step => ({ location: path, step }))
    })
    .toSorted((left, right) => left.location.localeCompare(right.location))
}

describe('backstopBandViolation', () => {
  it.each([
    [8, null],
    [12, null],
    [7, 'timeout-minutes 7 outside the 8-12 backstop band'],
    [13, 'timeout-minutes 13 outside the 8-12 backstop band'],
    [undefined, 'missing timeout-minutes'],
  ])('a build-lock step with timeout-minutes %s -> %s', (timeoutMinutes, expected) => {
    const step: WorkflowStep = { run: 'bash ci/with-build-lock.sh true' }
    if (timeoutMinutes !== undefined) step['timeout-minutes'] = timeoutMinutes
    expect(backstopBandViolation(step)).toBe(expected)
  })

  it('flags a YAML-quoted numeric string as a violation instead of coercing it', () => {
    // A quoted `timeout-minutes: "12"` (or an unresolved `${{ ... }}` expression)
    // parses to a string, not a number. Simulates that with a runtime-only cast,
    // since WorkflowStep's type already forbids it statically.
    const step = {
      run: 'bash ci/with-build-lock.sh true',
      'timeout-minutes': String(MAX_DIRECT_BUILD_LOCK_STEP_TIMEOUT_MINUTES),
    } as unknown as WorkflowStep
    expect(backstopBandViolation(step)).toBe('missing timeout-minutes')
  })
})

describe('effectiveJobWorkingDirectory', () => {
  it('falls back to the repo root when neither job nor workflow sets a default', () => {
    expect(effectiveJobWorkingDirectory({}, {})).toBe('.')
  })

  it('uses the workflow-level default when the job sets none', () => {
    const workflow: WorkflowFile = { defaults: { run: { 'working-directory': 'web' } } }
    expect(effectiveJobWorkingDirectory(workflow, {})).toBe('web')
  })

  it('prefers the job-level default over the workflow-level default', () => {
    const workflow: WorkflowFile = { defaults: { run: { 'working-directory': 'web' } } }
    const job: WorkflowJob = { defaults: { run: { 'working-directory': 'backend' } } }
    expect(effectiveJobWorkingDirectory(workflow, job)).toBe('backend')
  })
})

describe('actionYamlPaths', () => {
  it('finds action.yml files nested below intermediate directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'action-yaml-paths-'))
    try {
      mkdirSync(join(root, 'flat'))
      writeFileSync(join(root, 'flat', 'action.yml'), 'runs: {}\n')
      mkdirSync(join(root, 'group', 'nested'), { recursive: true })
      writeFileSync(join(root, 'group', 'nested', 'action.yaml'), 'runs: {}\n')

      expect(actionYamlPaths(root).toSorted()).toEqual(
        [join(root, 'flat', 'action.yml'), join(root, 'group', 'nested', 'action.yaml')].toSorted(),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('serialized build job timeout budgets', () => {
  it('documents every direct or package-script workflow consumer of ci/with-build-lock.sh', () => {
    // Change-detector: update this expectation (and keep the band test below green, 8-12m) when a
    // workflow gains or loses a build-lock consumer step — whether a literal
    // `run: bash ci/with-build-lock.sh ...` or an indirect lock-owning package script. There are
    // currently none: every Next build (including checks-static.yml's static-web, since #10990)
    // reaches the wrapper only indirectly through the build-web-targets composite's package script
    // — see compositeOnlyBuildLockJobs above.
    expect(directWorkflowBuildLockConsumers().map(consumer => consumer.location)).toEqual([])
  })

  it('keeps every discovered direct build-lock step within the backstop band', () => {
    const violations = directWorkflowBuildLockConsumers()
      .map(({ location, step }) => {
        const violation = backstopBandViolation(step)
        return violation === null ? null : `${location}: ${violation}`
      })
      .filter((violation): violation is string => violation !== null)
    expect(violations).toEqual([])
  })

  it('discovers no composite action run: step invoking ci/with-build-lock.sh', () => {
    // Composite-action run: steps cannot carry timeout-minutes, so any build-lock call here —
    // literal or via a lock-owning package script (see compositeActionBuildLockConsumers above,
    // e.g. setup-backend/action.yml's email-templates build, a real but currently non-lock-owning
    // instance of this shape) — would be uncappable and must not exist.
    expect(compositeActionBuildLockConsumers().map(consumer => consumer.location)).toEqual([])
  })

  it.each(strictNextBuildJobs)(
    '%s#%s gives the Next build its strict timeout and a larger job budget',
    (file, jobName) => {
      const { job, workingDirectory } = workflowJob(file, jobName)
      const buildStep = (job.steps ?? []).find(
        step =>
          step.uses === './.github/actions/build-web-targets' || step.run === 'pnpm run build',
      )

      // The build step itself may now be discovered as a build-lock consumer — a literal
      // `run: pnpm run build` step resolves through the package-script registry above. What must
      // stay excluded is any OTHER, separate lock invocation sharing this job.
      expect(buildLockSteps(job, workingDirectory).filter(step => step !== buildStep)).toHaveLength(
        0,
      )
      expect(buildStep?.['timeout-minutes']).toBe(STRICT_NEXT_BUILD_STEP_TIMEOUT_MINUTES)
      expect(job['timeout-minutes']).toBeGreaterThan(STRICT_NEXT_BUILD_STEP_TIMEOUT_MINUTES)
    },
  )

  it('documents the current lock wait in the authoring budget', () => {
    const authoring = readFileSync('.github/workflows/AUTHORING.md', 'utf8')
    const stepTimeouts = readFileSync('.github/workflows/reference-step-timeouts.md', 'utf8')
    const jobTimeoutBudgets = readFileSync(
      'docs/development/reference-ci-ci-job-timeout-budgets.md',
      'utf8',
    )

    expect(authoring).toContain('[Step Timeouts](reference-step-timeouts.md)')
    expect(stepTimeouts).toMatch(
      /\|\s*Lock-aware build steps \(`with-build-lock\.sh`\)\s*\|\s*8m\s*\|/,
    )
    expect(stepTimeouts).toMatch(/\|\s*Strict Next build steps\s*\|\s*13m\s*\|/)
    expect(stepTimeouts).toContain('reference-ci-ci-job-timeout-budgets.md')
    expect(jobTimeoutBudgets).toContain('reference-step-timeouts.md')
    expect(jobTimeoutBudgets).toContain('reference-runner-types.md')
    expect(jobTimeoutBudgets).toContain('Linux ARM64 platform package')
  })
})
