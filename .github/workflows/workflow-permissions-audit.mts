import { readFileSync } from 'node:fs'

import type { WorkflowTopology } from 'no-mistakes'
import {
  callerCalleePermissionMismatches as publishedCallerCalleePermissionMismatches,
  missingTopLevelPermissionPaths as publishedMissingTopLevelPermissionPaths,
  parseWorkflow,
  type Workflow,
} from 'vouchington-tooling/workflow-policy'

function readWorkflow(path: string): Workflow {
  return parseWorkflow(readFileSync(path, 'utf8'))
}

export function missingTopLevelPermissionPaths(paths: readonly string[]): string[] {
  return publishedMissingTopLevelPermissionPaths(
    Object.fromEntries(paths.map(path => [path, readWorkflow(path)])),
  )
}

/** Reads caller and callee workflow files, then compares their permission grants. */
export function callerCalleePermissionMismatches(topology: WorkflowTopology): string[] {
  const documents: Record<string, Workflow> = {}
  const workflowsById = new Map(topology.workflows.map(workflow => [workflow.id, workflow]))
  const workflowsByPath = new Map(topology.workflows.map(workflow => [workflow.path, workflow]))
  const jobsById = new Map(topology.jobs.map(job => [job.id, job]))
  for (const edge of topology.edges) {
    if (edge.kind !== 'calls' || !edge.local || edge.to === undefined) continue
    const callee = workflowsByPath.get(edge.to)
    const callerJob = jobsById.get(edge.from)
    if (!callerJob || !callee?.callable) continue
    const callerPath = workflowsById.get(callerJob.workflowId)?.path ?? callerJob.workflowId
    documents[callerPath] ??= readWorkflow(callerPath)
    documents[callee.path] ??= readWorkflow(callee.path)
  }
  return publishedCallerCalleePermissionMismatches(topology, documents)
}
