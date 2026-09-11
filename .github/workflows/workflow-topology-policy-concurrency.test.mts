import { describe, expect, it } from 'vitest'

import type { WorkflowConcurrency, WorkflowTopology } from 'no-mistakes'
import type { ConcurrencyPolicy } from './concurrency-topology-policy.mts'
import { evaluateLockPolicy } from './workflow-topology-policy-concurrency.mts'
import type { WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'

function concurrency(
  group: string,
  cancelInProgress: WorkflowConcurrency['effective']['cancelInProgress'] = false,
  queue = 'single',
): WorkflowConcurrency {
  return {
    raw: { group, cancelInProgress, queue },
    effective: { group, cancelInProgress, queue },
  }
}

function lockedTopology(groups: readonly string[]): WorkflowTopology {
  return {
    schemaVersion: 1,
    workflows: groups.map((group, index) => {
      const path = `${index + 1}.yml`
      return {
        id: path,
        path,
        name: path,
        callable: false,
        triggers: [],
        jobIds: [],
        concurrency: concurrency(group),
      }
    }),
    jobs: [],
    edges: [],
    diagnostics: [],
  }
}

const policy = (
  reasons: Readonly<Record<string, string>> = {},
): Pick<WorkflowTopologyPolicy, 'unlockedWorkflowReasons'> => ({
  unlockedWorkflowReasons: reasons,
})

const retained = (
  scope: ConcurrencyPolicy['scope'] = [],
  sharedFamily?: string,
): ConcurrencyPolicy<string> => ({
  pending: 'coalesce-latest',
  cancellation: 'retain-running',
  scope,
  ...(sharedFamily ? { sharedFamily } : {}),
})

describe('workflow topology concurrency diagnostics', () => {
  it('reports pending, cancellation, and scope mismatches', () => {
    const topology = lockedTopology(['${{ github.ref }}'])
    topology.workflows[0]!.concurrency = concurrency(
      '${{ github.ref }}',
      "${{ github.event_name == 'pull_request' }}",
      'max',
    )
    const diagnostics = evaluateLockPolicy(topology, policy(), { '1.yml': retained() })
    expect(diagnostics).toContain(
      'concurrency pending mismatch: 1.yml: expected coalesce-latest, got fifo',
    )
    expect(diagnostics).toContain(
      'concurrency cancellation mismatch: 1.yml: expected retain-running, got conditional',
    )
    expect(diagnostics).toContain('concurrency scope mismatch: 1.yml: expected , got ref')
  })

  it('reports shared-family group mismatches', () => {
    const topology = lockedTopology(['first-group', 'second-group'])
    const semantics = {
      '1.yml': retained([], 'shared-global-state'),
      '2.yml': retained([], 'shared-global-state'),
    }
    const owners = {
      'shared-staging-state': [],
      'shared-global-state': ['1.yml', '2.yml'],
    } as const
    expect(evaluateLockPolicy(topology, policy(), semantics, owners)).toContain(
      'shared concurrency family group mismatch: shared-global-state: 1.yml, 2.yml',
    )
  })

  it('accepts identical expression groups in a declared shared family', () => {
    const topology = lockedTopology([
      'deploy-${{ inputs.environment }}',
      'deploy-${{ inputs.environment }}',
    ])
    const semantics = {
      '1.yml': retained([], 'shared-global-state'),
      '2.yml': retained([], 'shared-global-state'),
    }
    const owners = {
      'shared-staging-state': [],
      'shared-global-state': ['1.yml', '2.yml'],
    } as const
    expect(evaluateLockPolicy(topology, policy(), semantics, owners)).not.toContain(
      'shared concurrency family group mismatch: shared-global-state: 1.yml, 2.yml',
    )
  })

  it('reports undeclared collisions between identical expression groups', () => {
    const topology = lockedTopology(['${{ github.ref }}', '${{ github.ref }}'])
    const semantics = { '1.yml': retained(['ref']), '2.yml': retained(['ref']) }
    expect(evaluateLockPolicy(topology, policy(), semantics)).toContain(
      'concurrency group collision undeclared: ${{ github.ref }}: 1.yml, 2.yml',
    )
  })

  it('partitions github.workflow-qualified groups by owning workflow', () => {
    const group = '${{ github.workflow }}-${{ github.ref }}'
    const topology = lockedTopology([group, group])
    const semantics = { '1.yml': retained(['ref']), '2.yml': retained(['ref']) }
    expect(evaluateLockPolicy(topology, policy(), semantics)).not.toContain(
      `concurrency group collision undeclared: ${group}: 1.yml, 2.yml`,
    )
  })

  it('rejects an empty unlocked-workflow reason', () => {
    const topology = lockedTopology(['unused'])
    delete topology.workflows[0]!.concurrency
    expect(evaluateLockPolicy(topology, policy({ '1.yml': '   ' }), {})).toContain(
      'unlocked reason empty: 1.yml',
    )
  })

  it('rejects malformed conditional cancel-in-progress expressions', () => {
    const topology = lockedTopology(['lock'])
    topology.workflows[0]!.concurrency = concurrency('lock', 'github.ref == main')
    expect(evaluateLockPolicy(topology, policy(), { '1.yml': retained() })).toContain(
      'conditional cancel-in-progress expression invalid: 1.yml: github.ref == main',
    )
  })
})
