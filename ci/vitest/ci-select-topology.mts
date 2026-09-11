import { writeFileSync } from 'node:fs'

import { ciTopologyImpact } from 'no-mistakes'

import {
  CI_ROOT_JOB_IDS,
  CI_WORKFLOW_PATH,
  isTopologyPath,
  loadCiTopologyImpactRouting,
  routeCiTopologyImpact,
  TOPOLOGY_ROOT_JOB_IDS,
  topologyOutputName,
} from '../workflow-topology-impact.mts'
import { isCiControlSurface } from './ci-control-surfaces.mts'

export type TopologySelection = {
  affectedRootJobIds: Set<string>
  fullCi: boolean
  fullJobs: Set<string>
  reason?: string
}

export function writeTopologyOutputs(
  writeOutput: (key: string, value: string) => void,
  fullCi: boolean,
  affectedRootJobIds = new Set<string>(),
): void {
  writeOutput('full-ci', fullCi ? 'true' : 'false')
  for (const rootJobId of TOPOLOGY_ROOT_JOB_IDS) {
    writeOutput(
      topologyOutputName(rootJobId),
      fullCi || affectedRootJobIds.has(rootJobId) ? 'true' : 'false',
    )
  }
}

function writeArtifacts(input: object, impact: unknown, reason?: string): void {
  const report = { input, impact: impact ?? null, ...(reason === undefined ? {} : { reason }) }
  try {
    writeFileSync('ci-topology-impact.json', `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(
      'ci-topology-impact.md',
      `# CI topology impact\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`,
    )
  } catch (error) {
    console.warn(`[select] failed to write topology impact artifacts: ${String(error)}`)
  }
}

export async function selectTopology({
  changedFiles,
  worktreeRoot,
  allVitestJobs,
  writeOutput,
}: {
  changedFiles: readonly string[]
  worktreeRoot: string
  allVitestJobs: readonly string[]
  writeOutput: (key: string, value: string) => void
}): Promise<TopologySelection> {
  if (changedFiles.some(isCiControlSurface)) {
    writeTopologyOutputs(writeOutput, true)
    return {
      affectedRootJobIds: new Set(TOPOLOGY_ROOT_JOB_IDS),
      fullCi: true,
      fullJobs: new Set(allVitestJobs),
      reason: 'CI control surface changed',
    }
  }
  if (!changedFiles.some(isTopologyPath)) {
    writeTopologyOutputs(writeOutput, false)
    return { affectedRootJobIds: new Set(), fullCi: false, fullJobs: new Set() }
  }
  const input = {
    root: worktreeRoot,
    base: process.env['TOPOLOGY_BASE_SHA'] ?? '',
    head: process.env['TOPOLOGY_HEAD_SHA'] ?? '',
    entryWorkflow: CI_WORKFLOW_PATH,
  }
  if (!input.base || !input.head) {
    writeArtifacts(input, null, 'missing exact topology revisions')
    writeTopologyOutputs(writeOutput, true)
    return {
      affectedRootJobIds: new Set(TOPOLOGY_ROOT_JOB_IDS),
      fullCi: true,
      fullJobs: new Set(allVitestJobs),
      reason: 'missing exact topology revisions',
    }
  }
  let impact: unknown
  let routing
  try {
    impact = await ciTopologyImpact(input)
    routing = routeCiTopologyImpact(impact, {
      input,
      changedPaths: changedFiles,
      knownRootJobIds: CI_ROOT_JOB_IDS,
    })
  } catch (error) {
    routing = await loadCiTopologyImpactRouting(async () => Promise.reject(error), {
      input,
      changedPaths: changedFiles,
      knownRootJobIds: CI_ROOT_JOB_IDS,
    })
  }
  writeArtifacts(input, impact, routing.reason)
  if (routing.globalFallback) {
    writeTopologyOutputs(writeOutput, true)
    return {
      affectedRootJobIds: new Set(routing.affectedRootJobIds),
      fullCi: true,
      fullJobs: new Set(allVitestJobs),
      reason: routing.reason,
    }
  }
  writeTopologyOutputs(writeOutput, false, routing.affectedRootJobIds)
  const fullJobs = new Set(['test-tooling'])
  for (const root of routing.affectedRootJobIds) {
    const job = root.slice(`${CI_WORKFLOW_PATH}#`.length)
    if (allVitestJobs.includes(job)) fullJobs.add(job)
  }
  return { affectedRootJobIds: new Set(routing.affectedRootJobIds), fullCi: false, fullJobs }
}
