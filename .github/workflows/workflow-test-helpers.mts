import picomatch from 'picomatch'

export type WorkflowStep = {
  name?: string
  id?: string
  if?: string | boolean
  env?: Record<string, string>
  run?: string
  uses?: string
}

export type WorkflowJob = {
  steps?: WorkflowStep[]
}

export type WorkflowLike = {
  on?: unknown
}

type WorkflowTriggerObject = Record<string, unknown>

export function assertWorkflowInvariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function assertNoWorkflowViolations(violations: readonly string[], heading?: string): void {
  if (violations.length === 0) return
  throw new Error(heading ? `${heading}\n${violations.join('\n')}` : violations.join('\n'))
}

function isWorkflowTriggerObject(trigger: unknown): trigger is WorkflowTriggerObject {
  return trigger != null && typeof trigger === 'object' && !Array.isArray(trigger)
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function gitSubcommandPattern(subcommand: string): RegExp {
  return new RegExp(
    String.raw`\bgit\b(?:\s+(?:-\S+(?:\s+\S+)?|--\S+(?:\s+\S+)?))*\s+` +
      subcommand +
      String.raw`\b`,
  )
}

export function workflowTriggerNames(trigger: unknown): string[] {
  if (typeof trigger === 'string') return [trigger]
  if (Array.isArray(trigger)) return stringList(trigger)
  if (!isWorkflowTriggerObject(trigger)) return []
  return Object.keys(trigger)
}

export function workflowHasTrigger(trigger: unknown, name: string): boolean {
  return workflowTriggerNames(trigger).includes(name)
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

export function shellLogicalLines(script: string): string[] {
  const lines: string[] = []
  let current = ''

  for (const rawLine of script.split('\n')) {
    const line = rawLine.trimEnd()
    const trailingBackslashes = line.match(/\\+$/)
    const continues = trailingBackslashes ? trailingBackslashes[0].length % 2 === 1 : false
    if (continues) {
      current += `${line.slice(0, -1)} `
      continue
    }
    lines.push(current + line)
    current = ''
  }

  if (current) lines.push(current)
  return lines
}

export function requiredNamedStep(job: WorkflowJob | undefined, name: string): WorkflowStep {
  if (!job) throw new Error(`Cannot find step "${name}" because the job is undefined`)
  if (!job.steps) throw new Error(`Cannot find step "${name}" because the job has no steps`)
  const step = job.steps.find(candidate => candidate.name === name)
  if (!step) throw new Error(`Missing workflow step: ${name}`)
  return step
}

export function requiredStepIf(
  step: WorkflowStep,
  label = step.name ?? step.id ?? 'step',
): string | boolean {
  if (step.if === undefined || step.if === null) {
    throw new Error(`Missing if expression for workflow step: ${label}`)
  }
  return step.if
}

export function requiredStepRun(
  step: WorkflowStep,
  label = step.name ?? step.id ?? 'step',
): string {
  if (!step.run) throw new Error(`Missing run script for workflow step: ${label}`)
  return step.run
}

export function assertShellSnippetsInOrder(script: string, snippets: readonly string[]): void {
  const logicalScript = shellLogicalLines(script).join('\n')
  let cursor = 0

  for (const snippet of snippets) {
    const index = logicalScript.indexOf(snippet, cursor)
    if (index === -1) {
      const remaining = logicalScript.slice(cursor)
      const truncateLength = 200
      const context =
        remaining.length > truncateLength ? `${remaining.slice(0, truncateLength)}...` : remaining
      throw new Error(
        `Expected shell snippet after offset ${cursor}: "${snippet}"\n` +
          `Remaining script search context:\n${context}`,
      )
    }
    cursor = index + snippet.length
  }
}
