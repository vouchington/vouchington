import type { WorkflowTopology } from 'no-mistakes'

import { SECRET_INVENTORY } from './workflow-secrets-inventory.mts'

/** GitHub injects this into every job; it is never a provisioned repo/org/environment secret. */
const AMBIENT_SECRET_NAMES = new Set(['GITHUB_TOKEN'])

export interface SecretReference {
  readonly name: string
  readonly workflowPath: string
}

/** Workflow `id → path` mapping, shared by callers resolving a job's owning workflow file. */
export function workflowPathById(topology: WorkflowTopology): Map<string, string> {
  return new Map(topology.workflows.map(workflow => [workflow.id, workflow.path]))
}

/**
 * Every distinct `secrets.*` name referenced anywhere in the topology (workflow, job, or step
 * scope), each paired with the workflow file it was found in. Job-scope references include
 * explicit `workflow_call` secret-binding *names on the caller side* (e.g. a caller job's
 * `secrets: { X: ${{ secrets.Y }} }` surfaces `Y`), so a renamed secret is visible under its
 * real name at the calling workflow as well as under its contract name at the callee.
 *
 * Names only — this never reads a step's resolved `env` value, because workflow YAML never
 * holds one: `${{ secrets.NAME }}` is static expression text, not a fetched secret.
 */
export function collectSecretReferences(topology: WorkflowTopology): SecretReference[] {
  const pathById = workflowPathById(topology)
  const references: SecretReference[] = []

  for (const workflow of topology.workflows) {
    for (const name of workflow.secretReferences ?? []) {
      references.push({ name, workflowPath: workflow.path })
    }
  }
  for (const job of topology.jobs) {
    const workflowPath = pathById.get(job.workflowId) ?? job.workflowId
    for (const name of job.secretReferences ?? []) {
      references.push({ name, workflowPath })
    }
    for (const step of job.steps) {
      for (const name of step.secretReferences ?? []) {
        references.push({ name, workflowPath })
      }
    }
  }

  return references
}

function groupWorkflowsByName(references: readonly SecretReference[]): Map<string, Set<string>> {
  const byName = new Map<string, Set<string>>()
  for (const { name, workflowPath } of references) {
    if (AMBIENT_SECRET_NAMES.has(name)) continue
    const workflowPaths = byName.get(name) ?? new Set<string>()
    workflowPaths.add(workflowPath)
    byName.set(name, workflowPaths)
  }
  return byName
}

/** Secret names referenced in workflow YAML with no `SECRET_INVENTORY` entry. */
export function missingInventoryEntries(topology: WorkflowTopology): string[] {
  const byName = groupWorkflowsByName(collectSecretReferences(topology))
  return [...byName.keys()].filter(name => !Object.hasOwn(SECRET_INVENTORY, name)).sort()
}

/** `SECRET_INVENTORY` entries no longer referenced by any workflow. */
export function staleInventoryEntries(topology: WorkflowTopology): string[] {
  const byName = groupWorkflowsByName(collectSecretReferences(topology))
  return Object.keys(SECRET_INVENTORY)
    .filter(name => !byName.has(name))
    .sort()
}

/** Workflow paths that reference each name, for readiness-step checks and diagnostics. */
export function referencingWorkflowsByName(topology: WorkflowTopology): Map<string, Set<string>> {
  return groupWorkflowsByName(collectSecretReferences(topology))
}

/** `SECRET_INVENTORY` entries marked `provisioned: false`, i.e. real gaps. */
export function unprovisionedEntries(): string[] {
  const names: string[] = []
  for (const [name, entry] of Object.entries(SECRET_INVENTORY)) {
    if (!entry.provisioned) names.push(name)
  }
  return names.sort()
}
