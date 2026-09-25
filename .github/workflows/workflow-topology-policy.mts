import type { WorkflowTopology, WorkflowTopologyIndex } from 'no-mistakes'
import { evaluateLockPolicy } from './workflow-topology-policy-concurrency.mts'
import { evaluateGraphPolicy } from './workflow-topology-policy-graph.mts'
import { jobInventory, unlockedWorkflowReasons } from './workflow-topology-policy-inventory.mts'
import { routePolicy } from './workflow-topology-policy-routes.mts'
import type { WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'

export const workflowTopologyPolicy: WorkflowTopologyPolicy = {
  jobInventory,
  unlockedWorkflowReasons,
  ...routePolicy,
}

export function evaluateWorkflowTopologyPolicy(
  topology: WorkflowTopology,
  index: WorkflowTopologyIndex,
  policy: WorkflowTopologyPolicy = workflowTopologyPolicy,
): string[] {
  return [
    ...evaluateLockPolicy(topology, policy),
    ...evaluateGraphPolicy(topology, index, policy),
  ].toSorted()
}

export { evaluateGraphPolicy } from './workflow-topology-policy-graph.mts'
export type { WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'
