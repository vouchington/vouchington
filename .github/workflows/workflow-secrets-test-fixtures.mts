import { SECRET_INVENTORY, type SecretInventoryEntry } from './workflow-secrets-inventory.mts'

import type {
  ResolvedPermissions,
  WorkflowCallSecret,
  WorkflowJobNode,
  WorkflowNode,
  WorkflowStep,
  WorkflowTopology,
} from 'no-mistakes'

export const BASE_PERMISSIONS: ResolvedPermissions = {
  source: 'default',
  scopes: {},
  assumed_default: true,
}

/** R2_DOCS_ACCESS_KEY_ID is a real, currently-provisioned secret (see workflow-secrets-inventory.mts),
 *  but readiness-step suites across this directory use its name as a generic stand-in for "some
 *  unprovisioned secret with a readiness-step contract" — so every case that needs one injects this
 *  override rather than relying on the real inventory's `provisioned` value for that name, which
 *  `unprovisionedSecretsWithoutReadinessStep` would otherwise skip entirely. */
export const INVENTORY_WITH_UNPROVISIONED_R2_DOCS: Record<string, SecretInventoryEntry> = {
  ...SECRET_INVENTORY,
  R2_DOCS_ACCESS_KEY_ID: {
    provisioned: false,
    notes:
      'Test fixture override: exercised here as an unprovisioned secret regardless of real state.',
  },
}

export function fixtureWorkflow(
  id: string,
  path: string,
  options: { jobIds?: string[]; secretReferences?: string[] } = {},
): WorkflowNode {
  return {
    id,
    path,
    name: path,
    triggers: [],
    jobIds: options.jobIds ?? [],
    secretReferences: options.secretReferences,
    callable: false,
  }
}

export function fixtureCallableWorkflow(
  id: string,
  path: string,
  secrets: Record<string, WorkflowCallSecret>,
  options: { jobIds?: string[] } = {},
): WorkflowNode {
  return {
    id,
    path,
    name: path,
    triggers: [{ event: 'workflow_call' }],
    jobIds: options.jobIds ?? [],
    callable: true,
    workflowCall: { inputs: {}, secrets, outputs: {} },
  }
}

export function fixtureJob(
  id: string,
  workflowId: string,
  options: { secretReferences?: string[]; steps?: WorkflowStep[] } = {},
): WorkflowJobNode {
  return {
    id,
    workflowId,
    key: id,
    kind: 'job',
    steps: options.steps ?? [],
    permissions: BASE_PERMISSIONS,
    secretReferences: options.secretReferences,
  }
}

export function fixtureTopology(
  workflows: WorkflowNode[],
  jobs: WorkflowJobNode[],
): WorkflowTopology {
  return { schemaVersion: 1, workflows, jobs, edges: [], diagnostics: [] }
}
