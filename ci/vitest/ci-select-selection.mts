import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type PlannedTestTarget, type PlannedTests } from '../test-plan.mts'
import { selectedFilesExceedEnvBudget } from 'vouchington-tooling/gha-selected-files'
import { shardTotalFor } from './shard-total.mts'
import {
  PLAN_JSON_ARTIFACT,
  PLAN_MARKDOWN_ARTIFACT,
  SHARDED_JOB_POLICIES,
} from './ci-select-catalog.mts'

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
