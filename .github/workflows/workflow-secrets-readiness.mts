import type { WorkflowTopology } from 'no-mistakes'
import { unprovisionedSecretsWithoutReadinessStep as publishedUnprovisionedSecretsWithoutReadinessStep } from 'vouchington-tooling/workflow-policy'

import { SECRET_INVENTORY, type SecretInventoryEntry } from './workflow-secrets-inventory.mts'

const PUBLISHED_READINESS_SHAPE = '`if [ -z "$VAR" ]; then ...; exit 1; fi`)'
const VOUCHINGTON_READINESS_SHAPE =
  '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)'

/**
 * `SECRET_INVENTORY` entries marked `provisioned: false` whose consuming workflow has no
 * early-fail readiness step. The published evaluator owns the step shape; this adapter keeps
 * the repo inventory default and the operator hint that points at the real preflight example.
 */
export function unprovisionedSecretsWithoutReadinessStep(
  topology: WorkflowTopology,
  inventory: Record<string, SecretInventoryEntry> = SECRET_INVENTORY,
): string[] {
  return publishedUnprovisionedSecretsWithoutReadinessStep(topology, inventory).map(violation =>
    violation.endsWith(PUBLISHED_READINESS_SHAPE)
      ? violation.replace(PUBLISHED_READINESS_SHAPE, VOUCHINGTON_READINESS_SHAPE)
      : violation,
  )
}
