#!/usr/bin/env node

import type { WorkflowTopology } from 'no-mistakes'

import {
  callerCalleePermissionMismatches,
  missingTopLevelPermissionPaths,
} from '../.github/workflows/workflow-permissions-audit.mts'
import {
  missingInventoryEntries,
  staleInventoryEntries,
} from '../.github/workflows/workflow-secrets-policy.mts'
import { unprovisionedSecretsWithoutReadinessStep } from '../.github/workflows/workflow-secrets-readiness.mts'
import { assertNoWorkflowViolations } from '../.github/test-helpers/workflow-fixtures.mts'
import { githubWorkflowPaths, loadRepoTopology } from './repo-topology.mts'
import { writeJobsInventoryDoc } from './render-workflow-runner-inventory.mts'

const noMistakesPolicyCommand = 'node ci/check-no-mistakes-test-policy.mts'

export function noMistakesPolicyInvocationErrors(topology: WorkflowTopology): string[] {
  const job = topology.jobs.find(
    job =>
      job.workflowId === '.github/workflows/static-code-analysis.yml' && job.key === 'no-mistakes',
  )
  const matches =
    job?.steps.flatMap(step =>
      (step.run ?? '')
        .split('\n')
        .map(line => line.trim().split(/\s+/u).join(' '))
        .filter(line => line === noMistakesPolicyCommand),
    ).length ?? 0
  return matches === 1
    ? []
    : [
        `.github/workflows/static-code-analysis.yml no-mistakes job must invoke ${noMistakesPolicyCommand} exactly once (found ${matches})`,
      ]
}

export function liveTopologyAuditErrors(topology: WorkflowTopology): string[] {
  if (topology.diagnostics.length > 0) {
    return topology.diagnostics.map(
      diagnostic => `${diagnostic.workflowPath}: ${diagnostic.message}`,
    )
  }

  return [
    ...noMistakesPolicyInvocationErrors(topology),
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
if (import.meta.main) {
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
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
/* v8 ignore stop */
