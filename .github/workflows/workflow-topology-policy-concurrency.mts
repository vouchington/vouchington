import type { WorkflowTopology } from 'no-mistakes'
import {
  evaluateLockPolicy as evaluatePublishedLockPolicy,
  type ConcurrencyPolicy,
} from 'vouchington-tooling/workflow-policy'

import { concurrencyTopologyPolicy } from './concurrency-topology-policy.mts'
import type { WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'

/** Applies the repo lock-intent table to the published concurrency evaluator. */
export function evaluateLockPolicy(
  topology: WorkflowTopology,
  policy: Pick<WorkflowTopologyPolicy, 'unlockedWorkflowReasons'>,
  semanticPolicy: Readonly<Record<string, ConcurrencyPolicy>> = concurrencyTopologyPolicy,
): string[] {
  return evaluatePublishedLockPolicy(topology, policy.unlockedWorkflowReasons, semanticPolicy)
}
