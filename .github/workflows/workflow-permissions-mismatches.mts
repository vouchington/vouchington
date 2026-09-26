import type { WorkflowCallEdge, WorkflowTopology } from 'no-mistakes'

import {
  parsePermissions,
  permissionsToMap,
  readWorkflow,
  requiredWorkflowPermissions,
} from './workflow-permissions-audit.mts'

export function callerCalleePermissionMismatches(topology: WorkflowTopology): string[] {
  const mismatches: string[] = []
  const jobsById = new Map(topology.jobs.map(job => [job.id, job]))
  const workflowsByPath = new Map(topology.workflows.map(workflow => [workflow.path, workflow]))
  const localCalls = topology.edges.filter(
    (edge): edge is WorkflowCallEdge => edge.kind === 'calls' && edge.local,
  )

  for (const call of localCalls) {
    const callerJob = jobsById.get(call.from)
    const callee = call.to ? workflowsByPath.get(call.to) : undefined
    if (!callerJob || !callee?.callable) continue
    const callerPath = callerJob.workflowId
    const caller = readWorkflow(callerPath)
    const job = caller.jobs?.[callerJob.key]
    if (!job) continue
    const calleePath = callee.path
    const calleeWorkflow = readWorkflow(calleePath)

    const calleePerms = requiredWorkflowPermissions(calleeWorkflow)
    const jobPerms = parsePermissions(job.permissions)
    if (jobPerms == null) {
      mismatches.push(
        `  ${callerPath} job "${callerJob.key}" → ${calleePath}: missing explicit job-level permissions`,
      )
      continue
    }

    if (jobPerms === 'write-all' || calleePerms === 'write-all') {
      if (jobPerms !== calleePerms) {
        mismatches.push(
          `  ${callerPath} job "${callerJob.key}" → ${calleePath}: caller grants ${jobPerms}, callee requires ${calleePerms}`,
        )
      }
      continue
    }

    const callerMap = permissionsToMap(jobPerms) ?? new Map<string, string>()
    const calleeMap = permissionsToMap(calleePerms) ?? new Map<string, string>()
    const callerEntries = [...callerMap].toSorted(([left], [right]) => left.localeCompare(right))
    const calleeEntries = [...calleeMap].toSorted(([left], [right]) => left.localeCompare(right))
    if (JSON.stringify(callerEntries) !== JSON.stringify(calleeEntries)) {
      mismatches.push(
        `  ${callerPath} job "${callerJob.key}" → ${calleePath}: caller grants ${JSON.stringify(Object.fromEntries(callerEntries))}, callee requires ${JSON.stringify(Object.fromEntries(calleeEntries))}`,
      )
    }
  }

  return mismatches
}
