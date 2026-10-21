import type { WorkflowCallEdge, WorkflowJobNode, WorkflowTopology } from 'no-mistakes'
import { unprovisionedSecretsWithoutReadinessStep as publishedUnprovisionedSecretsWithoutReadinessStep } from 'vouchington-tooling/workflow-policy'

import { SECRET_INVENTORY, type SecretInventoryEntry } from './workflow-secrets-inventory.mts'

const PUBLISHED_READINESS_SHAPE = '`if [ -z "$VAR" ]; then ...; exit 1; fi`)'
const VOUCHINGTON_READINESS_SHAPE =
  '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)'
const VIOLATION_PREFIX = /^(.+?): "([^"]+)" is unprovisioned with no early-fail readiness step /

/**
 * `SECRET_INVENTORY` entries marked `provisioned: false` whose consuming workflow has no
 * early-fail readiness step. The published evaluator owns the step shape; this adapter keeps
 * the repo inventory default and the operator hint that points at the real preflight example.
 *
 * A `uses:` job cannot host that step. When its only reference forwards the secret on an
 * explicit local `workflow_call` to a callee that declares the same secret `required: false`,
 * the callee already owns the empty-secret path. An `exit 1` on the caller would reject a
 * secret the contract allows to be absent.
 */
export function unprovisionedSecretsWithoutReadinessStep(
  topology: WorkflowTopology,
  inventory: Record<string, SecretInventoryEntry> = SECRET_INVENTORY,
): string[] {
  return publishedUnprovisionedSecretsWithoutReadinessStep(topology, inventory).flatMap(
    violation => {
      const match = VIOLATION_PREFIX.exec(violation)
      if (
        match?.[1] !== undefined &&
        match[2] !== undefined &&
        optionalForwardClearsWorkflow(topology, match[1], match[2], inventory)
      ) {
        return []
      }
      return [
        violation.endsWith(PUBLISHED_READINESS_SHAPE)
          ? violation.replace(PUBLISHED_READINESS_SHAPE, VOUCHINGTON_READINESS_SHAPE)
          : violation,
      ]
    },
  )
}

function optionalForwardClearsWorkflow(
  topology: WorkflowTopology,
  workflowPath: string,
  secretName: string,
  inventory: Record<string, SecretInventoryEntry>,
): boolean {
  const workflow = topology.workflows.find(candidate => candidate.path === workflowPath)
  if (!workflow || (workflow.secretReferences ?? []).includes(secretName)) return false
  const consumingJobs = topology.jobs.filter(
    job => job.workflowId === workflow.id && jobReferencesSecret(job, secretName),
  )
  return (
    consumingJobs.length > 0 &&
    consumingJobs.every(
      job =>
        forwardsOnlyToOptionalCallee(topology, job, secretName) ||
        publishedJobIsGuarded(topology, job, secretName, inventory),
    )
  )
}

function jobReferencesSecret(job: WorkflowJobNode, secretName: string): boolean {
  if ((job.secretReferences ?? []).includes(secretName)) return true
  return job.steps.some(step => (step.secretReferences ?? []).includes(secretName))
}

function forwardsOnlyToOptionalCallee(
  topology: WorkflowTopology,
  job: WorkflowJobNode,
  secretName: string,
): boolean {
  if (!(job.secretReferences ?? []).includes(secretName)) return false
  if (job.steps.some(step => (step.secretReferences ?? []).includes(secretName))) return false
  if (
    recordReferencesSecret(job.env, secretName) ||
    recordReferencesSecret(job.outputs, secretName)
  ) {
    return false
  }
  const edges = topology.edges.filter(
    (edge): edge is WorkflowCallEdge => edge.kind === 'calls' && edge.from === job.id,
  )
  let forwarded = false
  for (const edge of edges) {
    if (edge.bindings.secrets.mode === 'inherit') return false
    for (const [destination, value] of Object.entries(edge.bindings.secrets.values)) {
      if (typeof value !== 'string' || !referencesSecretExpression(value, secretName)) continue
      if (
        !edge.local ||
        edge.to === undefined ||
        !calleeDeclaresOptional(topology, edge.to, destination)
      ) {
        return false
      }
      forwarded = true
    }
  }
  return forwarded
}

function publishedJobIsGuarded(
  topology: WorkflowTopology,
  job: WorkflowJobNode,
  secretName: string,
  inventory: Record<string, SecretInventoryEntry>,
): boolean {
  const workflow = topology.workflows.find(candidate => candidate.id === job.workflowId)
  if (!workflow) return false
  const isolated: WorkflowTopology = {
    schemaVersion: topology.schemaVersion,
    workflows: [
      {
        ...workflow,
        jobIds: [job.id],
        secretReferences: (workflow.secretReferences ?? []).filter(name => name !== secretName),
      },
    ],
    jobs: [job],
    edges: [],
    diagnostics: [],
  }
  return !publishedUnprovisionedSecretsWithoutReadinessStep(isolated, inventory).some(violation =>
    violation.includes(`"${secretName}"`),
  )
}

function calleeDeclaresOptional(
  topology: WorkflowTopology,
  calleePath: string,
  secretName: string,
): boolean {
  const callee = topology.workflows.find(workflow => workflow.path === calleePath)
  if (callee?.callable !== true) return false
  const declared = callee.workflowCall.secrets[secretName]
  if (declared === undefined) return false
  return !declared.required
}

function recordReferencesSecret(
  record: Record<string, string> | undefined,
  secretName: string,
): boolean {
  return Object.values(record ?? {}).some(value => referencesSecretExpression(value, secretName))
}

function referencesSecretExpression(value: string, secretName: string): boolean {
  const escaped = secretName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(String.raw`secrets\.${escaped}\b`).test(value)
}
