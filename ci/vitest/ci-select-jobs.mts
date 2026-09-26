import type { PlannedTests } from '../test-plan.mts'
import { writeSelectedFilesOutput } from 'vouchington-tooling/gha-selected-files'
import {
  PLAN_MARKDOWN_ARTIFACT,
  PROJECT_TO_JOB,
  SHARDED_JOBS,
  STORYBOOK_BROWSER_PROJECT,
  STORYBOOK_JOB,
  allJobs,
  buildFileGroupTypes,
  isWarmJob,
  nonTopologyFullJobs,
  resolveJobSelection,
  resolveProjectName,
  selectedShardTotal,
  shouldSkipJob,
  storybookBrowserSelection,
  writeOutput,
} from './ci-select.mts'

type FullOut = (
  reason: string,
  note: string,
  topology: { affectedRootJobIds: Set<string>; fullCi: boolean },
) => void

export function writeSelectedJobs(input: {
  fullOut: FullOut
  jobSuites: Map<string, number>
  plan: PlannedTests
  topology: { affectedRootJobIds: Set<string>; fullCi: boolean; fullJobs: Set<string> }
}):
  | { stopped: true }
  | {
      jobFiles: Map<string, Set<string>>
      jobsRunningTests: Map<string, boolean>
      resolvedFullJobs: Set<string>
      skippedJobs: string[]
      stopped: false
      storybookBrowserMode: string
    } {
  const { fullOut, jobSuites, plan, topology } = input
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
      return { stopped: true }
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

  const jobsRunningTests = new Map<string, boolean>()
  const resolvedFullJobs = new Set<string>(fullJobs)
  for (const job of SHARDED_JOBS) {
    const files = [...(jobFiles.get(job) ?? new Set<string>())]
    const { fullJob, selectedFiles } = resolveJobSelection(
      job,
      files,
      fullJobs.has(job),
      jobSuites.get(job) ?? 0,
    )
    if (fullJob) resolvedFullJobs.add(job)
    const runTests = fullJob || selectedFiles.length > 0
    const shardTotal = selectedShardTotal(job, fullJob, selectedFiles.length)
    jobsRunningTests.set(job, runTests)
    writeOutput(`full-${job}`, fullJob ? 'true' : 'false')
    writeOutput(`run-tests-${job}`, runTests ? 'true' : 'false')
    if (shardTotal !== undefined) writeOutput(`shard-total-${job}`, String(shardTotal))
    writeSelectedFilesOutput(`files-${job}`, selectedFiles)
  }

  for (const job of SHARDED_JOBS) {
    if (jobsRunningTests.get(job) === false) writeOutput(`skip-${job}`, 'true')
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

  return {
    jobFiles,
    jobsRunningTests,
    resolvedFullJobs,
    skippedJobs,
    stopped: false,
    storybookBrowserMode,
  }
}
