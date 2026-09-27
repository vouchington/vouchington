import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
export { callerCalleePermissionMismatches } from './workflow-permissions-mismatches.mts'

export type Workflow = {
  permissions?: unknown
  on?: unknown
  jobs?: Record<string, Job>
}

type Job = {
  uses?: string
  permissions?: unknown
}

export function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

export function parsePermissions(
  perms: unknown,
): Map<string, string> | 'read-all' | 'write-all' | null {
  if (perms == null) return null
  if (perms === 'read-all') return 'read-all'
  if (perms === 'write-all') return 'write-all'
  if (isValidPermissionMap(perms)) {
    return new Map(Object.entries(perms).filter(([, level]) => level !== 'none'))
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
const PERMISSION_LEVELS = new Set(['none', 'read', 'write'])
const KNOWN_PERMISSION_SCOPES = new Set([...READ_ALL_PERMISSIONS, 'id-token'])

export function isValidPermissionMap(perms: unknown): perms is Record<string, string> {
  if (perms == null || typeof perms !== 'object' || Array.isArray(perms)) return false
  return Object.entries(perms).every(([scope, level]) => {
    if (!KNOWN_PERMISSION_SCOPES.has(scope) || typeof level !== 'string') return false
    if (!PERMISSION_LEVELS.has(level)) return false
    if (scope === 'id-token') return level === 'none' || level === 'write'
    if (scope === 'models') return level === 'none' || level === 'read'
    return true
  })
}

export function isValidPermissionDeclaration(perms: unknown): boolean {
  return perms === 'read-all' || perms === 'write-all' || isValidPermissionMap(perms)
}

function expandReadAllPermissions(): Map<string, string> {
  return new Map(READ_ALL_PERMISSIONS.map(permission => [permission, 'read']))
}

export function permissionsToMap(
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

export function requiredWorkflowPermissions(
  workflow: Workflow,
): Map<string, string> | 'read-all' | 'write-all' | null {
  const topLevelPerms = parsePermissions(workflow.permissions)
  let requiredPerms: Map<string, string> | 'read-all' | 'write-all' | null = topLevelPerms

  for (const job of Object.values(workflow.jobs ?? {})) {
    requiredPerms = unionPermissions(requiredPerms, parsePermissions(job.permissions))
  }

  return requiredPerms
}

export function hasPermissionInheritance(workflow: Workflow): boolean {
  if ('permissions' in workflow) return false
  return Object.values(workflow.jobs ?? {}).some(job => !('permissions' in job))
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
