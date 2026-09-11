import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import type { WorkflowCallEdge, WorkflowTopology } from 'no-mistakes'

type Workflow = {
  permissions?: unknown
  on?: unknown
  jobs?: Record<string, Job>
}

type Job = {
  uses?: string
  permissions?: unknown
}

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function parsePermissions(perms: unknown): Map<string, string> | 'read-all' | 'write-all' | null {
  if (perms == null) return null
  if (perms === 'read-all') return 'read-all'
  if (perms === 'write-all') return 'write-all'
  if (typeof perms === 'object' && !Array.isArray(perms)) {
    return new Map(Object.entries(perms as Record<string, string>))
  }
  return null
}

const PERM_LEVEL: Record<string, number> = { none: 0, read: 1, write: 2 }
const READ_ALL_PERMISSIONS = [
  'actions',
  'attestations',
  'checks',
  'contents',
  'deployments',
  'discussions',
  'issues',
  'models',
  'packages',
  'pages',
  'pull-requests',
  'repository-projects',
  'security-events',
  'statuses',
] as const

function expandReadAllPermissions(): Map<string, string> {
  return new Map(READ_ALL_PERMISSIONS.map(permission => [permission, 'read']))
}

function permissionsToMap(
  permissions: Map<string, string> | 'read-all' | null,
): Map<string, string> | null {
  if (permissions === 'read-all') return expandReadAllPermissions()
  return permissions
}

function unionPermissions(
  left: Map<string, string> | 'read-all' | 'write-all' | null,
  right: Map<string, string> | 'read-all' | 'write-all' | null,
): Map<string, string> | 'read-all' | 'write-all' | null {
  if (left === 'write-all' || right === 'write-all') return 'write-all'
  if (left === 'read-all' && right === 'read-all') return 'read-all'

  const leftMap = permissionsToMap(left)
  const rightMap = permissionsToMap(right)
  if (leftMap == null) return rightMap
  if (rightMap == null) return leftMap

  const result = new Map(leftMap)
  for (const [perm, level] of rightMap) {
    const current = result.get(perm)
    if ((PERM_LEVEL[level] ?? 0) > (PERM_LEVEL[current ?? 'none'] ?? 0)) {
      result.set(perm, level)
    }
  }
  return result
}

function requiredWorkflowPermissions(
  workflow: Workflow,
): Map<string, string> | 'read-all' | 'write-all' | null {
  const topLevelPerms = parsePermissions(workflow.permissions)
  let requiredPerms: Map<string, string> | 'read-all' | 'write-all' | null = topLevelPerms

  for (const job of Object.values(workflow.jobs ?? {})) {
    requiredPerms = unionPermissions(requiredPerms, parsePermissions(job.permissions))
  }

  return requiredPerms
}

export function isPureReusableWorkflow(workflow: Workflow): boolean {
  const on = workflow.on as Record<string, unknown> | string | null | undefined
  return Boolean(
    on && typeof on === 'object' && 'workflow_call' in on && Object.keys(on).length === 1,
  )
}

export function missingTopLevelPermissionPaths(paths: readonly string[]): string[] {
  const missing: string[] = []
  for (const path of paths) {
    const workflow = readWorkflow(path)
    if (isPureReusableWorkflow(workflow)) continue
    if (!('permissions' in workflow)) missing.push(path)
  }
  return missing
}

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
