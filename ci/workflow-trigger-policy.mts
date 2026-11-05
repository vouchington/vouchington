import picomatch from 'picomatch'

export type WorkflowLike = {
  on?: unknown
}

type WorkflowTriggerObject = Record<string, unknown>

function isWorkflowTriggerObject(trigger: unknown): trigger is WorkflowTriggerObject {
  return trigger != null && typeof trigger === 'object' && !Array.isArray(trigger)
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function workflowTriggerNames(trigger: unknown): string[] {
  if (typeof trigger === 'string') return [trigger]
  if (Array.isArray(trigger)) return stringList(trigger)
  if (!isWorkflowTriggerObject(trigger)) return []
  return Object.keys(trigger)
}

function workflowTriggerField(trigger: unknown, field: string): unknown {
  if (!isWorkflowTriggerObject(trigger)) return undefined
  return trigger[field]
}

export function pushTriggerBranches(pushTrigger: unknown): string[] {
  return stringList(workflowTriggerField(pushTrigger, 'branches'))
}

export function pushTriggerBranchesIgnored(pushTrigger: unknown): string[] {
  return stringList(workflowTriggerField(pushTrigger, 'branches-ignore'))
}

function branchMatchesAnyPattern(branch: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => picomatch.isMatch(branch, pattern, { dot: true }))
}

function branchMatchesOrderedPatterns(branch: string, patterns: readonly string[]): boolean {
  let matched = false
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (branchMatchesAnyPattern(branch, [pattern.slice(1)])) matched = false
      continue
    }
    if (branchMatchesAnyPattern(branch, [pattern])) matched = true
  }
  return matched
}

export function workflowPushMatchesBranch(
  workflow: WorkflowLike | undefined,
  branch: string,
): boolean {
  const trigger = workflow?.on
  if (typeof trigger === 'string') return trigger === 'push'
  if (Array.isArray(trigger)) return trigger.includes('push')
  if (!isWorkflowTriggerObject(trigger)) return false

  const pushTrigger = trigger.push
  if (pushTrigger === undefined) return false
  if (pushTrigger === null) return true

  const ignoredBranches = pushTriggerBranchesIgnored(pushTrigger)
  if (branchMatchesOrderedPatterns(branch, ignoredBranches)) return false

  const branches = pushTriggerBranches(pushTrigger)
  if (Object.hasOwn(pushTrigger as object, 'branches')) {
    return branchMatchesOrderedPatterns(branch, branches)
  }

  if (Object.hasOwn(pushTrigger as object, 'branches-ignore')) {
    return true
  }

  if (
    Object.hasOwn(pushTrigger as object, 'tags') ||
    Object.hasOwn(pushTrigger as object, 'tags-ignore')
  ) {
    return false
  }

  return true
}

export function workflowHasMainPushTrigger(workflow: WorkflowLike | undefined): boolean {
  return workflowPushMatchesBranch(workflow, 'main')
}

export function workflowRunSubscriptions(trigger: unknown): string[] {
  const workflowRun = workflowTriggerField(trigger, 'workflow_run')
  if (workflowRun == null) return []
  return stringList(workflowTriggerField(workflowRun, 'workflows'))
}
