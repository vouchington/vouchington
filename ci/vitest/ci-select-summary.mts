import type { PlannedTests } from '../test-plan.mts'

import {
  SHARDED_JOBS,
  STORYBOOK_JOB,
  allJobs,
  appendSummary,
  formatJobSummaryRows,
  groupCount,
  writeOutput,
} from './ci-select-catalog.mts'
import { planCommentSummary, selectedShardTotal } from './ci-select-selection.mts'

export function writeSelectionSummary(input: {
  jobFiles: Map<string, Set<string>>
  jobsRunningTests: Map<string, boolean>
  plan: PlannedTests
  resolvedFullJobs: Set<string>
  skippedJobs: string[]
  storybookBrowserMode: string
}): void {
  const { jobFiles, jobsRunningTests, plan, resolvedFullJobs, skippedJobs, storybookBrowserMode } =
    input
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
          const shardTotal = SHARDED_JOBS.includes(job)
            ? selectedShardTotal(job, fullJob, files.size)
            : undefined
          return {
            job,
            mode: fullJob
              ? ('full' as const)
              : runsTests
                ? ('selected' as const)
                : ('empty' as const),
            count: fullJob ? ('all' as const) : files.size,
            ...(shardTotal === undefined ? {} : { shards: shardTotal }),
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
