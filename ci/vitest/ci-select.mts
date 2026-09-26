import { runVitestCiSelect } from './ci-select-run.mts'
// oxlint-disable max-lines -- centralized multi-job routing and fail-open output contracts stay together
import { appendFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { pair2BaseRef } from '../pr-revision-pairs.mts'
import { planTests, type PlannedTestTarget, type PlannedTests } from '../test-plan.mts'
import {
  selectedFilesExceedEnvBudget,
  writeSelectedFilesOutput,
} from 'vouchington-tooling/gha-selected-files'
import { assertBackendUnitSuiteBounds, countJobSuiteFiles } from './job-suite-count.mts'
import { shardTotalFor } from './shard-total.mts'
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

export function writeOutput(key: string, value: string): void {
  const f = process.env['GITHUB_OUTPUT']
  if (f) appendFileSync(f, `${key}=${value}\n`)
  console.log(`[select] ${key}=${value}`)
}

export function appendSummary(text: string): void {
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
export function couldBeDeletedShellPolicySource(path: string): boolean {
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
    base: pair2BaseRef(baseBranch),
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

export function selectedShardTotal(
  job: string,
  fullJob: boolean,
  selectedFileCount: number,
): number | undefined {
  const policy = SHARDED_JOB_POLICIES[job]
  if (policy === undefined) throw new Error(`No sharding policy is registered for ${job}`)
  if (policy.mode === 'fixed') return policy.shards
  if (fullJob) return undefined
  return selectedFileCount <= 0 ? undefined : shardTotalFor(selectedFileCount, policy.filesPerShard)
}

export function resolveProjectName(target: PlannedTestTarget): string | null {
  if (target.project != null && target.project !== '') return target.project
  const index = target.runnerArgs.indexOf('--project')
  const fromArgs = index === -1 ? undefined : target.runnerArgs[index + 1]
  return fromArgs ?? null
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

export function writePlanArtifacts(plan: PlannedTests, artifactDirectory: string): void {
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

export { runVitestCiSelect }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runVitestCiSelect().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
