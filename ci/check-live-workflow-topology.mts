#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createWorkflowTopologyIndex, type WorkflowTopology } from 'no-mistakes'

import {
  callerCalleePermissionMismatches,
  missingTopLevelPermissionPaths,
} from '../.github/workflows/workflow-permissions-audit.mts'
import {
  missingInventoryEntries,
  staleInventoryEntries,
} from '../.github/workflows/workflow-secrets-policy.mts'
import { unprovisionedSecretsWithoutReadinessStep } from '../.github/workflows/workflow-secrets-readiness.mts'
import { assertNoWorkflowViolations } from '../.github/test-helpers/workflow-test-helpers.mts'
import { evaluateWorkflowTopologyPolicy } from '../.github/workflows/workflow-topology-policy.mts'
import { githubWorkflowPaths, loadRepoTopology } from './repo-topology.mts'
import { writeJobsInventoryDoc } from './render-workflow-runner-inventory.mts'

const __filename = fileURLToPath(import.meta.url)

export function liveTopologyAuditErrors(topology: WorkflowTopology): string[] {
  if (topology.diagnostics.length > 0) {
    return topology.diagnostics.map(
      diagnostic => `${diagnostic.workflowPath}: ${diagnostic.message}`,
    )
  }

  const index = createWorkflowTopologyIndex(topology)
  return [
    ...evaluateWorkflowTopologyPolicy(topology, index),
    ...callerCalleePermissionMismatches(topology),
    ...missingInventoryEntries(topology).map(
      name => `secret ${name} is referenced with no SECRET_INVENTORY entry`,
    ),
    ...staleInventoryEntries(topology).map(
      name => `SECRET_INVENTORY entry ${name} is not referenced by any workflow`,
    ),
    ...unprovisionedSecretsWithoutReadinessStep(topology),
  ]
}

/* v8 ignore start -- direct-execution entry; live CI check, not a Vitest suite. */
if (process.argv?.[1] && realpathSync(process.argv[1]) === __filename) {
  try {
    const topology = await loadRepoTopology()
    const errors = liveTopologyAuditErrors(topology)
    if (errors.length > 0) throw new Error(errors.join('\n'))
    assertNoWorkflowViolations(
      missingTopLevelPermissionPaths(githubWorkflowPaths()),
      'Workflows missing top-level permissions:',
    )
    await writeJobsInventoryDoc({ check: true, topology })
    console.log('Live workflow topology checks passed.')
    process.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
/* v8 ignore stop */
