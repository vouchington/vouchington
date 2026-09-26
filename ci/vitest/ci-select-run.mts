import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeSelectedFilesOutput } from 'vouchington-tooling/gha-selected-files'
import { planTests, type PlannedTests } from '../test-plan.mts'
import { assertBackendUnitSuiteBounds, countJobSuiteFiles } from './job-suite-count.mts'
import { selectTopology, writeTopologyOutputs } from './ci-select-topology.mts'
import {
  PLAN_JSON_ARTIFACT,
  PLAN_MARKDOWN_ARTIFACT,
  SHARDED_JOBS,
  STORYBOOK_JOB,
  allJobs,
  appendSummary,
  formatJobSummaryRows,
  vitestPlanOptions,
  writeOutput,
} from './ci-select-catalog.mts'
import {
  planCommentSummary,
  selectedShardTotal,
  writePlanArtifacts,
} from './ci-select-selection.mts'
import { writeSelectedJobs } from './ci-select-jobs.mts'
import { writeSelectionSummary } from './ci-select-summary.mts'

export async function runVitestCiSelect(
  runPlanner: typeof planTests = planTests,
  artifactDirectory = process.cwd(),
  countJobSuites: typeof countJobSuiteFiles = countJobSuiteFiles,
): Promise<void> {
  const eventName = process.env['EVENT_NAME'] ?? ''
  const worktreeRoot = process.env['GITHUB_WORKSPACE'] ?? process.cwd()

  let jobSuites = new Map<string, number>()
  try {
    jobSuites = countJobSuites(worktreeRoot)
    const backendUnitSuite = jobSuites.get('test-backend-unit')
    if (backendUnitSuite !== undefined) assertBackendUnitSuiteBounds(backendUnitSuite)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `[select] job suite count failed; selection will not promote by suite fraction: ${message}`,
    )
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
      const shardTotal = selectedShardTotal(job, true, 0)
      if (shardTotal !== undefined) writeOutput(`shard-total-${job}`, String(shardTotal))
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
    appendSummary(
      [
        '## Vitest Test Selection',
        '',
        `**Mode:** Full suite - ${note}`,
        '',
        '| Job | Mode | Selected files | Shards | File details |',
        '| --- | --- | ---: | ---: | --- |',
        ...formatJobSummaryRows(
          allJobs().map(job => {
            const shardTotal = SHARDED_JOBS.includes(job)
              ? selectedShardTotal(job, true, 0)
              : undefined
            return {
              job,
              mode: 'full' as const,
              count: 'all' as const,
              ...(shardTotal === undefined ? {} : { shards: shardTotal }),
            }
          }),
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
    baseBranch,
  })
  if (topology.fullCi) {
    fullOut('workflow topology failed', topology.reason ?? 'workflow topology requested full CI', {
      affectedRootJobIds: topology.affectedRootJobIds,
      fullCi: topology.fullCi,
    })
    return
  }

  if (plan.fallbackTriggered) {
    const reason = plan.fallbackReason ?? 'test plan requested full suite'
    fullOut(reason, reason, topology)
    appendSummary(planCommentSummary(plan.comment))
    return
  }

  const selectedJobs = writeSelectedJobs({ fullOut, jobSuites, plan, topology })
  if (selectedJobs.stopped) return
  const { jobFiles, jobsRunningTests, resolvedFullJobs, skippedJobs, storybookBrowserMode } =
    selectedJobs
  writeSelectionSummary({
    jobFiles,
    jobsRunningTests,
    plan,
    resolvedFullJobs,
    skippedJobs,
    storybookBrowserMode,
  })
}
