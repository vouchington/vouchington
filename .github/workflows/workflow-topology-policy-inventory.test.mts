import { describe, expect, it } from 'vitest'

import { createWorkflowTopologyIndex, type WorkflowTopology } from 'no-mistakes'
import { evaluateGraphPolicy } from './workflow-topology-policy-graph.mts'
import type { WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'
import { BASE_PERMISSIONS } from './workflow-secrets-test-fixtures.mts'

const root = '.github/workflows/root.yml'
const stale = '.github/workflows/stale.yml'

function topology(): WorkflowTopology {
  return {
    schemaVersion: 1,
    workflows: [
      {
        id: root,
        path: root,
        name: 'Root',
        callable: false,
        triggers: [],
        jobIds: [`${root}#actual`],
      },
    ],
    jobs: [
      {
        id: `${root}#actual`,
        workflowId: root,
        key: 'actual',
        kind: 'job',
        steps: [],
        permissions: BASE_PERMISSIONS,
      },
    ],
    edges: [],
    diagnostics: [],
  }
}

function policy(jobInventory: WorkflowTopologyPolicy['jobInventory']): WorkflowTopologyPolicy {
  return {
    jobInventory,
    unlockedWorkflowReasons: { [root]: 'parallel-safe' },
    requiredJobs: [],
    forbiddenJobs: [],
    requiredDirectEdges: [],
    forbiddenDirectEdges: [],
    requiredTransitiveEdges: [],
    forbiddenTransitiveEdges: [],
    requiredArtifactEdges: [],
    exactFanIns: {},
    exactCallerJobs: {},
    stepOrders: [],
  }
}

function diagnostics(configured: WorkflowTopologyPolicy): string[] {
  const fixture = topology()
  return evaluateGraphPolicy(fixture, createWorkflowTopologyIndex(fixture), configured)
}

describe('workflow topology inventory diagnostics', () => {
  it('reports missing and stale workflow inventory rows', () => {
    expect(diagnostics(policy({}))).toContain(`workflow inventory missing: ${root}`)
    expect(diagnostics(policy({ [root]: ['actual'], [stale]: [] }))).toContain(
      `workflow inventory stale: ${stale}`,
    )
  })

  it('reports exact job inventory drift', () => {
    expect(diagnostics(policy({ [root]: ['declared'] }))).toContain(
      `job inventory mismatch: ${root}: expected declared, got actual`,
    )
  })
})
