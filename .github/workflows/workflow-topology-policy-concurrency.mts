import type { WorkflowConcurrency, WorkflowTopology } from 'no-mistakes'
import {
  concurrencyTopologyPolicy,
  sharedConcurrencyFamilyOwners,
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
  semanticPolicy: Readonly<Record<string, ConcurrencyPolicy<string>>> = concurrencyTopologyPolicy,
  familyOwners: Readonly<Record<string, readonly string[]>> = sharedConcurrencyFamilyOwners,
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
  diagnostics.push(...collisionDiagnostics(owners, semanticPolicy, familyOwners))
  return [...new Set(diagnostics)].toSorted()
}

function collisionDiagnostics(
  owners: Array<{ id: string; concurrency?: WorkflowConcurrency }>,
  semanticPolicy: Readonly<Record<string, ConcurrencyPolicy<string>>>,
  familyOwners: Readonly<Record<string, readonly string[]>>,
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
  return [...groups.values()]
    .flatMap(({ group, ids }) => {
      if (ids.length < 2) return []
      const families = ids.map(id => semanticPolicy[id]?.sharedFamily)
      if (families.some(family => !family) || new Set(families).size !== 1)
        return [`concurrency group collision undeclared: ${group}: ${ids.toSorted().join(', ')}`]
      const semantics = ids.map(id => {
        const concurrency = owners.find(owner => owner.id === id)?.concurrency?.effective
        return concurrency
          ? `${concurrency.queue === 'max' ? 'fifo' : 'coalesce-latest'}/${cancellation(concurrency.cancelInProgress)}`
          : 'missing'
      })
      return new Set(semantics).size === 1
        ? []
        : [`shared concurrency family incompatible: ${families[0]}: ${ids.toSorted().join(', ')}`]
    })
    .concat(sharedFamilyDiagnostics(owners, semanticPolicy, familyOwners))
}

function sharedFamilyDiagnostics(
  owners: Array<{ id: string; concurrency?: WorkflowConcurrency }>,
  semanticPolicy: Readonly<Record<string, ConcurrencyPolicy<string>>>,
  expectedOwners: Readonly<Record<string, readonly string[]>>,
): string[] {
  const families = new Map<string, typeof owners>()
  for (const owner of owners) {
    const family = semanticPolicy[owner.id]?.sharedFamily
    if (!family) continue
    const members = families.get(family) ?? []
    members.push(owner)
    families.set(family, members)
  }
  const diagnostics: string[] = []
  for (const [family, expected] of Object.entries(expectedOwners)) {
    const actual = (families.get(family) ?? []).map(member => member.id).toSorted()
    const sortedExpected = [...expected].toSorted()
    if (JSON.stringify(actual) !== JSON.stringify(sortedExpected))
      diagnostics.push(
        `shared concurrency family owners mismatch: ${family}: expected ${sortedExpected.join(', ')}, got ${actual.join(', ')}`,
      )
  }
  diagnostics.push(
    ...[...families.entries()].flatMap(([family, members]) => {
      if (members.length < 2) return []
      const ids = members
        .map(member => member.id)
        .toSorted()
        .join(', ')
      const groups = members.map(member =>
        normalizeSharedFamilyGroup(family, member.concurrency?.effective.group ?? ''),
      )
      const semantics = members.map(member => {
        const actual = member.concurrency?.effective
        return actual
          ? `${actual.queue === 'max' ? 'fifo' : 'coalesce-latest'}/${cancellation(actual.cancelInProgress)}`
          : 'missing'
      })
      const diagnostics: string[] = []
      if (new Set(groups).size !== 1)
        diagnostics.push(`shared concurrency family group mismatch: ${family}: ${ids}`)
      if (new Set(semantics).size !== 1)
        diagnostics.push(`shared concurrency family incompatible: ${family}: ${ids}`)
      return diagnostics
    }),
  )
  return diagnostics
}

function normalizeSharedFamilyGroup(_family: string, group: string): string {
  return group.toLocaleLowerCase('en-US')
}
