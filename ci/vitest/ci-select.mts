// oxlint-disable max-lines -- centralized multi-job routing and fail-open output contracts stay together
import { appendFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { planTests, type PlannedTestTarget, type PlannedTests } from '../test-plan.mts'
import {
  selectedFilesExceedEnvBudget,
  writeSelectedFilesOutput,
} from 'vouchington-tooling/gha-selected-files'
import { GITHUB_MATRIX_MAX_JOBS } from '../playwright/shard-selection.mts'
import { assertBackendUnitSuiteBounds, countJobSuiteFiles } from './job-suite-count.mts'
import { isShellPolicySource } from '../../.github/workflows/trivy-policy-helpers.mts'
import { isCiControlSurface } from './ci-control-surfaces.mts'
import {
  projectToJob,
  shardedJobPolicies,
  shardedJobs,
  sideDutyJobs,
  storybookBrowserProject,
  storybookJob,
} from './project-ownership-registry.mts'
import { selectTopology, writeTopologyOutputs } from './ci-select-topology.mts'

function writeOutput(key: string, value: string): void {
  const f = process.env['GITHUB_OUTPUT']
  if (f) appendFileSync(f, `${key}=${value}\n`)
  console.log(`[select] ${key}=${value}`)
}

function appendSummary(text: string): void {
  const f = process.env['GITHUB_STEP_SUMMARY']
  if (f) appendFileSync(f, text)
}

export const PLAN_JSON_ARTIFACT = 'vitest-test-plan.json'
export const PLAN_MARKDOWN_ARTIFACT = 'vitest-test-plan.md'

// Every registered Vitest project name, routed to the single CI job that runs it — derived from
// the canonical ci/vitest/project-ownership.mts model; do not hand-edit, edit the model instead.
// ci/vitest/ci-select.test.mts asserts this map stays total against the real
// vitest.config.mts project list — a newly-added project with no entry in the model
// fails that test, forcing the author to route it (or accept runtime fail-open).
export const PROJECT_TO_JOB: Record<string, string> = projectToJob()

export const SHARDED_JOBS: readonly string[] = shardedJobs()
export const SHARDED_JOB_POLICIES = shardedJobPolicies()
export const STORYBOOK_JOB = storybookJob()
export const STORYBOOK_BROWSER_PROJECT = storybookBrowserProject()
export const SIDE_DUTY_JOBS = sideDutyJobs()

const NON_TOPOLOGY_FULL_JOBS_BY_PREFIX: Readonly<Record<string, readonly string[]>> = {
  '.trivyignore.yaml': ['test-tooling'],
  'integration-tests/web/helpers/': ['test-web-api', 'test-web-integration'],
}
function couldBeDeletedShellPolicySource(path: string): boolean {
  const basename = path.slice(path.lastIndexOf('/') + 1)
  return basename.length > 0 && !basename.includes('.')
}

export function nonTopologyFullJobs(changedFiles: readonly string[]): Set<string> {
  if (changedFiles.some(isCiControlSurface)) return new Set(allJobs())
  const jobs = new Set<string>()
  if (changedFiles.some(file => isShellPolicySource(file) || couldBeDeletedShellPolicySource(file)))
    jobs.add('test-tooling')
  for (const [prefix, owningJobs] of Object.entries(NON_TOPOLOGY_FULL_JOBS_BY_PREFIX)) {
    if (changedFiles.some(file => file.startsWith(prefix))) {
      for (const job of owningJobs) jobs.add(job)
    }
  }
  return jobs
}

// no-mistakes >=0.35.0 traces Vitest `setupFiles`/`globalSetup` (both literal-string and
// project-array forms) as real dependency-graph edges, and falls back to a full-suite selection
// whenever a setup entry isn't statically resolvable (see docs/development/ci.md's "dynamic
// setupFiles" section). That made most of this repo's former
// hand-maintained safety net redundant. What remains here is a deliberately narrow fail-safe for
// edges the graph genuinely cannot see:
//   - `vitest.config.mts` and `test-helpers/vitest-config/` are NOT listed below: they are already
//     covered (and reached first) by `.no-mistakes.yml`'s named `test_plan.vitest.fullSuiteTriggers.
//     triggers` entry `root-config`, asserted by the CI-running (non-skipped)
//     ci/no-mistakes-test-plan-config.test.mts. `root-config` has no `targets:` key (short form),
//     so it triggers every Vitest project, not a subset — the separate `vitest-ci-path-coverage`
//     rule's `projectFilters.root-config: [tooling, backend]` (`.no-mistakes.yml`) only names which
//     job(s) that rule samples as coverage evidence that the trigger's paths are exercised by a
//     real test; it does not scope which jobs the trigger fires for.
//   - `test-helpers/vitest.setup.` and every `JOB_CONFIGURATION_PREFIXES` entry keyed by a
//     `*/vitest.setup.*` path are NOT listed below: they are graph-covered project setupFiles, and
//     an unresolvable setup path now trips `plan.fallbackTriggered` (which `main()` already treats
//     as full-suite) rather than silently under-selecting.
export function allJobs(): string[] {
  return [...new Set(Object.values(PROJECT_TO_JOB))]
}

export type JobSummary = {
  job: string
  mode: 'full' | 'selected' | 'empty'
  count: number | 'all'
  shards?: number
}

export function formatJobSummaryRows(summaries: readonly JobSummary[]): string[] {
  return summaries.map(
    ({ job, mode, count, shards }) =>
      `| \`${job}\` | ${mode} | ${count} | ${shards ?? '—'} | \`${PLAN_JSON_ARTIFACT}\` |`,
  )
}

export function storybookBrowserSelection(
  selectedFiles: readonly string[],
  forcedFull: boolean,
): { mode: 'full' | 'selected' | 'empty'; files: string[] } {
  if (forcedFull) return { mode: 'full', files: [] }
  return selectedFiles.length > 0
    ? { mode: 'selected', files: [...selectedFiles] }
    : { mode: 'empty', files: [] }
}

export function shouldSkipJob(job: string, runTests: boolean): boolean {
  return !runTests && !SIDE_DUTY_JOBS.has(job)
}

export function groupCount(
  planGroups: { type: string; selected: string[] }[],
  type: string,
): number {
  return (planGroups.find(group => group.type === type)?.selected ?? []).length
}

export function vitestPlanOptions(
  worktreeRoot: string,
  baseBranch: string,
): Parameters<typeof planTests>[0] {
  return {
    framework: 'vitest',
    worktreeRoot,
    environment: 'pullRequest',
    base: `origin/${baseBranch}`,
    head: 'HEAD',
    timeout: 0,
    lockTimeout: 0,
  }
}

// A file can appear in more than one group (e.g. both a reverse-import dependency
// and the random safety sample). Prefer the non-sample designation so cold-job
// exclusion below never mistakes a directly-affected file for a merely-sampled one.
export function buildFileGroupTypes(
  groups: { type: string; selected: string[] }[],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const group of groups) {
    for (const file of group.selected) {
      const existing = map.get(file)
      if (existing === undefined || existing === 'sample') {
        map.set(file, group.type)
      }
    }
  }
  return map
}

export function isWarmJob(files: Iterable<string>, fileGroupTypes: Map<string, string>): boolean {
  for (const file of files) {
    if (fileGroupTypes.get(file) !== 'sample') return true
  }
  return false
}

function resolveProjectName(target: PlannedTestTarget): string | null {
  if (target.project != null && target.project !== '') return target.project
  const index = target.runnerArgs.indexOf('--project')
  const fromArgs = index === -1 ? undefined : target.runnerArgs[index + 1]
  return fromArgs ?? null
}

export function shardTotalFor(fileCount: number, filesPerShard: number): number {
  return Math.min(GITHUB_MATRIX_MAX_JOBS, Math.max(1, Math.ceil(fileCount / filesPerShard)))
}

export function shardedJobTotal(job: string, suiteFileCount = 0): number {
  const policy = SHARDED_JOB_POLICIES[job]
  if (policy === undefined) throw new Error(`No sharding policy is registered for ${job}`)
  if (policy.mode === 'fixed' || suiteFileCount <= 0) return policy.defaultShards
  return shardTotalFor(suiteFileCount, policy.filesPerShard)
}

export function shardedJobOutcome(
  runTests: boolean | undefined,
  shardTotal: number | undefined,
  fallbackShardTotal: number,
): { skip: boolean; coverageShards: number } {
  if (runTests === false) return { skip: true, coverageShards: 0 }
  return { skip: false, coverageShards: shardTotal ?? fallbackShardTotal }
}

export type JobSelectionReason = 'forced-full' | 'suite-fraction' | 'env-budget' | 'selected'

export function resolveJobSelection(
  job: string,
  files: readonly string[],
  forcedFull: boolean,
  jobSuite = 0,
): { fullJob: boolean; selectedFiles: string[]; reason: JobSelectionReason } {
  if (forcedFull) return { fullJob: true, selectedFiles: [], reason: 'forced-full' }
  if (jobSuite > 0 && files.length * 2 > jobSuite) {
    console.log(
      `[select] promoting ${job} to full suite: selected ${files.length} of ${jobSuite} exceeds 50%`,
    )
    return { fullJob: true, selectedFiles: [], reason: 'suite-fraction' }
  }
  if (selectedFilesExceedEnvBudget(files)) {
    console.log(
      `[select] promoting ${job} to full suite: selected file list exceeds env ARG_MAX budget`,
    )
    return { fullJob: true, selectedFiles: [], reason: 'env-budget' }
  }
  return { fullJob: false, selectedFiles: [...files], reason: 'selected' }
}

function writePlanArtifacts(plan: PlannedTests, artifactDirectory: string): void {
  writeFileSync(
    join(artifactDirectory, PLAN_JSON_ARTIFACT),
    `${JSON.stringify(plan.json, null, 2)}\n`,
  )
  writeFileSync(
    join(artifactDirectory, PLAN_MARKDOWN_ARTIFACT),
    plan.comment ? `${plan.comment}\n` : 'No planner explanation was generated.\n',
  )
}

export const PLAN_COMMENT_SUMMARY_MAX_BYTES = 8_000

export function planCommentSummary(comment: string): string {
  if (!comment) return ''
  if (Buffer.byteLength(comment, 'utf8') > PLAN_COMMENT_SUMMARY_MAX_BYTES) {
    return [
      '',
      `Planner explanation omitted (${Buffer.byteLength(comment, 'utf8')} bytes). See \`${PLAN_MARKDOWN_ARTIFACT}\`.`,
      '',
    ].join('\n')
  }
  return [
    '',
    '<details><summary>Planner explanation</summary>',
    '',
    comment,
    '</details>',
    '',
  ].join('\n')
}

export async function runVitestCiSelect(
  runPlanner: typeof planTests = planTests,
  artifactDirectory = process.cwd(),
): Promise<void> {
  const eventName = process.env['EVENT_NAME'] ?? ''
  const worktreeRoot = process.env['GITHUB_WORKSPACE'] ?? process.cwd()

  let jobSuites = new Map<string, number>()
  try {
    jobSuites = countJobSuiteFiles(worktreeRoot)
    const backendUnitSuite = jobSuites.get('test-backend-unit')
    if (backendUnitSuite !== undefined) assertBackendUnitSuiteBounds(backendUnitSuite)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[select] job suite count failed; falling back to registry defaults: ${message}`)
    jobSuites = new Map()
  }

  const fullOut = (
    reason: string,
    note: string,
    topology = {
      affectedRootJobIds: new Set<string>(),
      fullCi: true,
    },
  ): void => {
    writeTopologyOutputs(writeOutput, topology.fullCi, topology.affectedRootJobIds)
    writeOutput('full-suite', 'true')
    writeOutput('reason', reason)
    for (const job of SHARDED_JOBS) {
      writeOutput(`shard-total-${job}`, String(shardedJobTotal(job, jobSuites.get(job))))
      writeSelectedFilesOutput(`files-${job}`, [])
      writeOutput(`full-${job}`, 'true')
      writeOutput(`run-tests-${job}`, 'true')
    }
    writeSelectedFilesOutput('storybook-browser-files', [])
    writeOutput('storybook-browser-mode', 'full')
    writeOutput('full-storybook', 'true')
    for (const job of allJobs()) {
      if (!(SHARDED_JOBS as readonly string[]).includes(job) && job !== STORYBOOK_JOB) {
        writeSelectedFilesOutput(`files-${job}`, [])
        writeOutput(`full-${job}`, 'true')
        writeOutput(`run-tests-${job}`, 'true')
      }
    }
    writeOutput(
      'coverage-plan',
      JSON.stringify({
        ...Object.fromEntries(
          SHARDED_JOBS.map(job => [job, { shards: shardedJobTotal(job, jobSuites.get(job)) }]),
        ),
      }),
    )
    appendSummary(
      [
        '## Vitest Test Selection',
        '',
        `**Mode:** Full suite - ${note}`,
        '',
        '| Job | Mode | Selected files | Shards | File details |',
        '| --- | --- | ---: | ---: | --- |',
        ...formatJobSummaryRows(
          allJobs().map(job => ({
            job,
            mode: 'full' as const,
            count: 'all' as const,
            ...(SHARDED_JOBS.includes(job)
              ? { shards: shardedJobTotal(job, jobSuites.get(job)) }
              : {}),
          })),
        ),
        '',
      ].join('\n'),
    )
    try {
      writeFileSync(
        join(artifactDirectory, PLAN_JSON_ARTIFACT),
        `${JSON.stringify({ mode: 'full', reason, note, plannerExecuted: false }, null, 2)}\n`,
      )
      writeFileSync(
        join(artifactDirectory, PLAN_MARKDOWN_ARTIFACT),
        `# Vitest test plan\n\nFull suite: ${note}\n\nReason: ${reason}\n`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[select] failed to write fallback test plan artifacts: ${message}`)
    }
  }

  if (eventName !== 'pull_request') {
    fullOut(`non-PR event (${eventName || 'unknown'})`, `event is \`${eventName || 'unknown'}\``, {
      affectedRootJobIds: new Set(),
      fullCi: false,
    })
    return
  }

  // Use GITHUB_BASE_REF when available so PRs targeting release/feature branches work correctly.
  const baseBranch = process.env['GITHUB_BASE_REF'] || 'main'

  let labels: string[] = []
  try {
    labels = JSON.parse(process.env['PR_LABELS'] ?? '[]') as string[]
  } catch {
    /* ignore malformed labels */
  }
  let plan: PlannedTests
  try {
    plan = await runPlanner(vitestPlanOptions(worktreeRoot, baseBranch))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fullOut('test planner failed', `no-mistakes test planner failed - ${message}`)
    return
  }

  try {
    writePlanArtifacts(plan, artifactDirectory)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[select] failed to write test plan artifacts: ${message}`)
  }

  const topology = await selectTopology({
    changedFiles: plan.changedFiles,
    worktreeRoot,
    allVitestJobs: allJobs(),
    writeOutput,
  })
  if (topology.fullCi) {
    fullOut('workflow topology failed', topology.reason ?? 'workflow topology requested full CI', {
      affectedRootJobIds: topology.affectedRootJobIds,
      fullCi: topology.fullCi,
    })
    return
  }

  if (labels.includes('vitest:full')) {
    fullOut('vitest:full label', '`vitest:full` label is set', topology)
    return
  }

  if (plan.fallbackTriggered) {
    const reason = plan.fallbackReason ?? 'test plan requested full suite'
    fullOut(reason, reason, topology)
    appendSummary(planCommentSummary(plan.comment))
    return
  }

  const jobFiles = new Map<string, Set<string>>()
  for (const target of plan.targets) {
    if (target.runner !== 'vitest') continue
    const project = resolveProjectName(target)
    const job = project == null ? undefined : PROJECT_TO_JOB[project]
    if (job === undefined) {
      fullOut(
        `unmapped Vitest project ${project ?? '(none)'}`,
        `Vitest project \`${project ?? '(none)'}\` has no CI job mapping in ci/vitest/ci-select.mts`,
        topology,
      )
      return
    }
    const files = jobFiles.get(job) ?? new Set<string>()
    for (const file of target.testFiles) files.add(file)
    jobFiles.set(job, files)
  }

  const fullJobs = nonTopologyFullJobs(plan.changedFiles)
  for (const job of topology.fullJobs) fullJobs.add(job)

  // Scope the random safety sample to already-warm jobs so a lone sampled file never
  // forces a cold job's full container startup (~30s) just to run one incidental test.
  // Cold-job regressions are still caught by main CI's full run. Flip
  // VITEST_SAMPLE_COLD_JOBS=false to restore global (unscoped) sampling.
  // Clearing a sharded job's files here makes the whole Vitest workflow skippable when no selected
  // tests remain. Backend API/worker smoke now has its own backend-area gate, so neither sharded
  // job needs a synthetic shard-1 invocation merely to retain a non-Vitest side duty.
  if (process.env['VITEST_SAMPLE_COLD_JOBS']?.toLowerCase() !== 'false') {
    const fileGroupTypes = buildFileGroupTypes(plan.groups)
    for (const [job, files] of jobFiles) {
      if (job === STORYBOOK_JOB) continue
      if (!isWarmJob(files, fileGroupTypes)) files.clear()
    }
  }

  const storybookBrowserTarget = plan.targets.find(
    target =>
      target.runner === 'vitest' && resolveProjectName(target) === STORYBOOK_BROWSER_PROJECT,
  )
  const storybookBrowserSelectionResult = storybookBrowserSelection(
    storybookBrowserTarget?.testFiles ?? [],
    fullJobs.has(STORYBOOK_JOB),
  )
  const storybookBrowserFiles = storybookBrowserSelectionResult.files
  const storybookBrowserMode = storybookBrowserSelectionResult.mode
  writeOutput('storybook-browser-mode', storybookBrowserMode)
  writeOutput('full-storybook', fullJobs.has(STORYBOOK_JOB) ? 'true' : 'false')
  writeSelectedFilesOutput('storybook-browser-files', storybookBrowserFiles)

  const shardTotals = new Map<string, number>()
  const jobsRunningTests = new Map<string, boolean>()
  const resolvedFullJobs = new Set<string>(fullJobs)
  for (const job of SHARDED_JOBS) {
    const files = [...(jobFiles.get(job) ?? new Set<string>())]
    const policy = SHARDED_JOB_POLICIES[job]
    if (policy === undefined) throw new Error(`No sharding policy is registered for ${job}`)
    const { fullJob, selectedFiles } = resolveJobSelection(
      job,
      files,
      fullJobs.has(job),
      jobSuites.get(job) ?? 0,
    )
    if (fullJob) resolvedFullJobs.add(job)
    const runTests = fullJob || selectedFiles.length > 0
    const shardTotal = fullJob
      ? shardedJobTotal(job, jobSuites.get(job))
      : policy.mode === 'fixed'
        ? policy.defaultShards
        : shardTotalFor(selectedFiles.length, policy.filesPerShard)
    shardTotals.set(job, shardTotal)
    jobsRunningTests.set(job, runTests)
    writeOutput(`full-${job}`, fullJob ? 'true' : 'false')
    writeOutput(`run-tests-${job}`, runTests ? 'true' : 'false')
    writeOutput(`shard-total-${job}`, String(shardTotal))
    writeSelectedFilesOutput(`files-${job}`, selectedFiles)
  }

  const shardedJobOutcomes = new Map(
    SHARDED_JOBS.map(job => [
      job,
      shardedJobOutcome(
        jobsRunningTests.get(job),
        shardTotals.get(job),
        SHARDED_JOB_POLICIES[job]?.defaultShards ?? 1,
      ),
    ]),
  )
  for (const [job, outcome] of shardedJobOutcomes) {
    if (outcome.skip) writeOutput(`skip-${job}`, 'true')
  }

  const skippableJobs = allJobs().filter(
    job => !(SHARDED_JOBS as readonly string[]).includes(job) && job !== STORYBOOK_JOB,
  )
  const skippedJobs: string[] = []
  for (const job of skippableJobs) {
    const files = [...(jobFiles.get(job) ?? new Set<string>())]
    const { fullJob, selectedFiles } = resolveJobSelection(
      job,
      files,
      fullJobs.has(job),
      jobSuites.get(job) ?? 0,
    )
    if (fullJob) resolvedFullJobs.add(job)
    const runTests = selectedFiles.length > 0 || fullJob
    writeOutput(`full-${job}`, fullJob ? 'true' : 'false')
    writeOutput(`run-tests-${job}`, runTests ? 'true' : 'false')
    writeSelectedFilesOutput(`files-${job}`, selectedFiles)
    if (shouldSkipJob(job, runTests)) {
      writeOutput(`skip-${job}`, 'true')
      skippedJobs.push(job)
    }
  }
  writeOutput(
    'coverage-plan',
    JSON.stringify({
      ...Object.fromEntries(
        SHARDED_JOBS.map(job => [
          job,
          {
            shards:
              shardedJobOutcomes.get(job)?.coverageShards ??
              SHARDED_JOB_POLICIES[job]?.defaultShards ??
              1,
          },
        ]),
      ),
    }),
  )

  writeOutput('full-suite', 'false')
  const direct = groupCount(plan.groups, 'direct')
  const dependencies = groupCount(plan.groups, 'dependencies')
  const sample = groupCount(plan.groups, 'sample')
  writeOutput(
    'reason',
    `${direct} direct + ${dependencies} dependencies + ${sample} sample = ${plan.files.length} total`,
  )
  appendSummary(
    [
      '## Vitest Test Selection',
      '',
      '| Bucket | Count |',
      '| --- | --- |',
      `| Directly changed | ${direct} |`,
      `| Dependency-related | ${dependencies} |`,
      `| Safety sample | ${sample} |`,
      `| **Total selected** | **${plan.files.length}** of ${plan.total} |`,
      '',
      '| Job | Mode | Selected files | Shards | File details |',
      '| --- | --- | ---: | ---: | --- |',
      ...formatJobSummaryRows(
        allJobs().map(job => {
          const files = jobFiles.get(job) ?? new Set<string>()
          const fullJob = resolvedFullJobs.has(job)
          const runsTests =
            job === STORYBOOK_JOB
              ? storybookBrowserMode !== 'empty' || files.size > 0
              : (jobsRunningTests.get(job) ?? (files.size > 0 || fullJob))
          const shards = shardTotals.get(job)
          return {
            job,
            mode: fullJob
              ? ('full' as const)
              : runsTests
                ? ('selected' as const)
                : ('empty' as const),
            count: fullJob ? ('all' as const) : files.size,
            ...(shards === undefined ? {} : { shards }),
          }
        }),
      ),
      '',
      `Skipped jobs: ${skippedJobs.length > 0 ? skippedJobs.map(job => `\`${job}\``).join(', ') : 'none'}`,
      '',
      'Planner artifacts: `vitest-test-plan.json`, `vitest-test-plan.md`',
      '',
      planCommentSummary(plan.comment),
      plan.warnings.length > 0 ? `Warnings:\n${plan.warnings.map(w => `- ${w}`).join('\n')}\n` : '',
    ].join('\n'),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runVitestCiSelect().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
