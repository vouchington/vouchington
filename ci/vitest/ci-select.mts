import { fileURLToPath } from 'node:url'

import { runVitestCiSelect } from './ci-select-run.mts'

export {
  PLAN_COMMENT_SUMMARY_MAX_BYTES,
  buildFileGroupTypes,
  isWarmJob,
  planCommentSummary,
  resolveJobSelection,
  resolveProjectName,
  selectedShardTotal,
  writePlanArtifacts,
} from './ci-select-selection.mts'
export type { JobSelectionReason } from './ci-select-selection.mts'
export {
  PLAN_JSON_ARTIFACT,
  PLAN_MARKDOWN_ARTIFACT,
  PROJECT_TO_JOB,
  SHARDED_JOBS,
  SHARDED_JOB_POLICIES,
  SIDE_DUTY_JOBS,
  STORYBOOK_BROWSER_PROJECT,
  STORYBOOK_JOB,
  allJobs,
  appendSummary,
  couldBeDeletedShellPolicySource,
  formatJobSummaryRows,
  groupCount,
  nonTopologyFullJobs,
  shouldSkipJob,
  storybookBrowserSelection,
  vitestPlanOptions,
  writeOutput,
} from './ci-select-catalog.mts'
export type { JobSummary } from './ci-select-catalog.mts'
export { runVitestCiSelect }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runVitestCiSelect().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
