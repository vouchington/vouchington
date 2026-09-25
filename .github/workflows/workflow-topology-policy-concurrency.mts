import type { WorkflowConcurrency, WorkflowTopology } from 'no-mistakes'
import {
  concurrencyTopologyPolicy,
  type ConcurrencyCancellationBehavior,
  type ConcurrencyPolicy,
} from './concurrency-topology-policy.mts'
import { extractConcurrencyScopes, normalizePolicyScopes } from './concurrency-topology-scope.mts'
import type { WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'

function cancellation(
  value: WorkflowConcurrency['effective']['cancelInProgress'],
): ConcurrencyCancellationBehavior {
  return typeof value === 'string' ? 'conditional' : value ? 'cancel-running' : 'retain-running'
}

export function evaluateLockPolicy(
  topology: WorkflowTopology,
  policy: Pick<WorkflowTopologyPolicy, 'unlockedWorkflowReasons'>,
  semanticPolicy: Readonly<Record<string, ConcurrencyPolicy>> = concurrencyTopologyPolicy,
): string[] {
  const diagnostics: string[] = []
  const owners = [...topology.workflows, ...topology.jobs].filter(owner => owner.concurrency)
  const actualOwnerIds = new Set(owners.map(owner => owner.id))
  const declaredOwnerIds = new Set(Object.keys(semanticPolicy))
  for (const id of [...actualOwnerIds].toSorted()) {
    if (!declaredOwnerIds.has(id)) diagnostics.push(`lock intent missing: ${id}`)
  }
  for (const id of [...declaredOwnerIds].toSorted()) {
    if (!actualOwnerIds.has(id)) diagnostics.push(`lock intent stale: ${id}`)
  }
  const jobsById = new Map(topology.jobs.map(job => [job.id, job]))
  for (const workflow of topology.workflows) {
    const unlockedReason = policy.unlockedWorkflowReasons[workflow.path]
    const hasUnlockedJob =
      !workflow.concurrency &&
      workflow.jobIds.some(jobId => jobsById.get(jobId)?.concurrency === undefined)
    if (hasUnlockedJob && !unlockedReason) diagnostics.push(`lock intent missing: ${workflow.path}`)
    if (!hasUnlockedJob && unlockedReason)
      diagnostics.push(`unlocked reason stale: ${workflow.path}`)
    if (unlockedReason !== undefined && unlockedReason.trim() === '')
      diagnostics.push(`unlocked reason empty: ${workflow.path}`)
  }
  for (const path of Object.keys(policy.unlockedWorkflowReasons).toSorted()) {
    if (!topology.workflows.some(workflow => workflow.path === path))
      diagnostics.push(`unlocked reason stale: ${path}`)
  }
  for (const owner of owners) {
    const declared = semanticPolicy[owner.id]
    if (!declared || !owner.concurrency) continue
    const cancelInProgress = owner.concurrency.effective.cancelInProgress
    if (
      typeof cancelInProgress === 'string' &&
      !/^\$\{\{\s*\S[\s\S]*\}\}$/.test(cancelInProgress.trim())
    )
      diagnostics.push(
        `conditional cancel-in-progress expression invalid: ${owner.id}: ${cancelInProgress}`,
      )
    const actualPending = owner.concurrency.effective.queue === 'max' ? 'fifo' : 'coalesce-latest'
    if (actualPending !== declared.pending)
      diagnostics.push(
        `concurrency pending mismatch: ${owner.id}: expected ${declared.pending}, got ${actualPending}`,
      )
    const actualCancellation = cancellation(owner.concurrency.effective.cancelInProgress)
    if (actualCancellation !== declared.cancellation)
      diagnostics.push(
        `concurrency cancellation mismatch: ${owner.id}: expected ${declared.cancellation}, got ${actualCancellation}`,
      )
    const actualScopes = extractConcurrencyScopes(owner.concurrency.effective.group)
    const expectedScopes = normalizePolicyScopes(declared.scope)
    if (JSON.stringify(actualScopes) !== JSON.stringify(expectedScopes))
      diagnostics.push(
        `concurrency scope mismatch: ${owner.id}: expected ${expectedScopes.join(',')}, got ${actualScopes.join(',')}`,
      )
  }
  diagnostics.push(...collisionDiagnostics(owners))
  return [...new Set(diagnostics)].toSorted()
}

function collisionDiagnostics(
  owners: Array<{ id: string; concurrency?: WorkflowConcurrency }>,
): string[] {
  const groups = new Map<string, { group: string; ids: string[] }>()
  for (const owner of owners) {
    const group = owner.concurrency?.effective.group
    if (!group) continue
    const normalizedGroup = group.toLocaleLowerCase('en-US')
    const workflowPartition = /\$\{\{\s*github\.workflow\s*\}\}/.test(group)
      ? owner.id.split('#')[0]
      : ''
    const key = `${normalizedGroup}\0${workflowPartition}`
    const entry = groups.get(key) ?? { group: normalizedGroup, ids: [] }
    entry.ids.push(owner.id)
    groups.set(key, entry)
  }
  return [...groups.values()].flatMap(({ group, ids }) =>
    ids.length > 1 ? [`concurrency group collision: ${group}: ${ids.toSorted().join(', ')}`] : [],
  )
}
