import type { WorkflowCallEdge, WorkflowTopology } from 'no-mistakes'

import {
  hasPermissionInheritance,
  isValidPermissionDeclaration,
  isValidPermissionMap,
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
    const jobPerms = parsePermissions(job.permissions)
    if (jobPerms === 'write-all') {
      mismatches.push(
        `  ${callerPath} job "${callerJob.key}" → ${callee.path}: caller grants write-all`,
      )
      continue
    }
    if (!isValidPermissionMap(job.permissions) || !(jobPerms instanceof Map)) {
      mismatches.push(
        `  ${callerPath} job "${callerJob.key}" → ${callee.path}: caller permissions must be an explicit map`,
      )
      continue
    }
    const calleePath = callee.path
    const calleeWorkflow = readWorkflow(calleePath)

    if (
      Object.hasOwn(calleeWorkflow, 'permissions') &&
      !isValidPermissionDeclaration(calleeWorkflow.permissions)
    ) {
      mismatches.push(
        `  ${callerPath} job "${callerJob.key}" → ${calleePath}: callee top-level permissions are invalid`,
      )
      continue
    }
    const invalidCalleeJobs: string[] = []
    for (const [key, calleeJob] of Object.entries(calleeWorkflow.jobs ?? {})) {
      if (
        Object.hasOwn(calleeJob, 'permissions') &&
        !isValidPermissionDeclaration(calleeJob.permissions)
      ) {
        invalidCalleeJobs.push(key)
      }
    }
    if (invalidCalleeJobs.length > 0) {
      mismatches.push(
        ...invalidCalleeJobs.map(
          key =>
            `  ${callerPath} job "${callerJob.key}" → ${calleePath}: callee job "${key}" permissions are invalid`,
        ),
      )
      continue
    }

    const calleePerms = requiredWorkflowPermissions(calleeWorkflow)

    if (calleePerms === 'write-all') {
      mismatches.push(
        `  ${callerPath} job "${callerJob.key}" → ${calleePath}: callee requires write-all`,
      )
      continue
    }

    const callerMap = permissionsToMap(jobPerms) ?? new Map<string, string>()
    const calleeMap = permissionsToMap(calleePerms) ?? new Map<string, string>()
    const callerEntries = [...callerMap].toSorted(([left], [right]) => left.localeCompare(right))
    const calleeEntries = [...calleeMap].toSorted(([left], [right]) => left.localeCompare(right))
    const calleeScopesFitCaller = calleeEntries.every(([scope, level]) => {
      const callerLevel = callerMap.get(scope)
      const levels = { none: 0, read: 1, write: 2 }
      return (
        (levels[callerLevel as keyof typeof levels] ?? 0) >=
        (levels[level as keyof typeof levels] ?? 0)
      )
    })
    const permissionsMatch = JSON.stringify(callerEntries) === JSON.stringify(calleeEntries)
    if (
      !calleeScopesFitCaller ||
      (!hasPermissionInheritance(calleeWorkflow) && !permissionsMatch)
    ) {
      mismatches.push(
        `  ${callerPath} job "${callerJob.key}" → ${calleePath}: caller grants ${JSON.stringify(Object.fromEntries(callerEntries))}, callee requires ${JSON.stringify(Object.fromEntries(calleeEntries))}`,
      )
    }
  }

  return mismatches
}
