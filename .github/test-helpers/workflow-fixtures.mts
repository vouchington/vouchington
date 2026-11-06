import { shellLogicalLines } from '../../ci/workflow-shell-policy.mts'
export {
  gitSubcommandPattern,
  shellLogicalLines,
  workflowHasTrigger,
} from '../../ci/workflow-shell-policy.mts'
export {
  pushTriggerBranches,
  pushTriggerBranchesIgnored,
  workflowHasMainPushTrigger,
  workflowPushMatchesBranch,
  workflowRunSubscriptions,
  workflowTriggerNames,
  type WorkflowLike,
} from '../../ci/workflow-trigger-policy.mts'

export type WorkflowStep = {
  name?: string
  id?: string
  if?: string | boolean
  env?: Record<string, string>
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

export type WorkflowJob = {
  steps?: WorkflowStep[]
}

export function assertWorkflowInvariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function assertNoWorkflowViolations(violations: readonly string[], heading?: string): void {
  if (violations.length === 0) return
  throw new Error(heading ? `${heading}\n${violations.join('\n')}` : violations.join('\n'))
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
