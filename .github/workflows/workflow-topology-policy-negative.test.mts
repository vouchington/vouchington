import { describe, expect, it } from 'vitest'

import {
  createWorkflowTopologyIndex,
  type WorkflowConcurrency,
  type WorkflowJobNode,
  type WorkflowTopology,
} from 'no-mistakes'
import type { ConcurrencyPolicy } from './concurrency-topology-policy.mts'
import { evaluateLockPolicy } from './workflow-topology-policy-concurrency.mts'
import { evaluateGraphPolicy } from './workflow-topology-policy-graph.mts'
import type { TargetedRule, WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'
import { BASE_PERMISSIONS } from './workflow-secrets-test-fixtures.mts'

const root = '.github/workflows/root.yml'
const leaf = '.github/workflows/leaf.yml'
const id = (key: string): string => `${root}#${key}`

function job(
  key: string,
  steps: WorkflowJobNode['steps'] = [],
  workflowId: string = root,
  extra: Partial<WorkflowJobNode> = {},
): WorkflowJobNode {
  return {
    id: `${workflowId}#${key}`,
    workflowId,
    key,
    kind: 'job',
    steps,
    permissions: BASE_PERMISSIONS,
    ...extra,
  }
}

function graphTopology(): WorkflowTopology {
  return {
    schemaVersion: 1,
    workflows: [
      {
        id: root,
        path: root,
        name: 'Root',
        callable: false,
        triggers: [],
        jobIds: ['a', 'b', 'c', 'call'].map(id),
      },
      {
        id: leaf,
        path: leaf,
        name: 'Leaf',
        callable: true,
        workflowCall: { inputs: {}, secrets: {}, outputs: {} },
        triggers: [],
        jobIds: [`${leaf}#work`],
      },
    ],
    jobs: [
      job('a', [
        { index: 0, kind: 'action', id: 'eligibility', uses: './eligibility' },
        { index: 1, kind: 'run', name: 'Mutate' },
      ]),
      job('b'),
      job('c'),
      job('call'),
      job('work', [], leaf),
    ],
    edges: [
      { kind: 'needs', from: id('a'), to: id('b') },
      { kind: 'needs', from: id('b'), to: id('c') },
      {
        kind: 'calls',
        from: id('call'),
        to: leaf,
        target: `./${leaf}`,
        local: true,
        bindings: { inputs: {}, secrets: { mode: 'explicit', values: {} } },
      },
      {
        kind: 'artifact',
        from: id('a'),
        to: id('b'),
        name: 'results',
        producerStep: 0,
        consumerStep: 0,
        match: 'exact',
      },
    ],
    diagnostics: [],
  }
}

function graphPolicy(): WorkflowTopologyPolicy {
  return {
    jobInventory: { [root]: ['a', 'b', 'c', 'call'], [leaf]: ['work'] },
    unlockedWorkflowReasons: { [root]: 'parallel-safe', [leaf]: 'caller-serialized' },
    requiredJobs: [id('a')],
    forbiddenJobs: [id('forbidden')],
    requiredDirectEdges: [[id('a'), id('b')]],
    forbiddenDirectEdges: [[id('a'), id('c')]],
    requiredTransitiveEdges: [[id('a'), id('c')]],
    forbiddenTransitiveEdges: [[id('c'), id('a')]],
    requiredArtifactEdges: [{ from: id('a'), to: id('b'), name: 'results', match: 'exact' }],
    exactFanIns: { [id('b')]: [id('a')] },
    exactCallerJobs: { [leaf]: [id('call')] },
    stepOrders: [{ jobId: id('a'), steps: [{ id: 'eligibility' }, { name: 'Mutate' }] }],
    targetedReruns: {},
  }
}

function evaluateGraph(
  topology: WorkflowTopology,
  policy = graphPolicy(),
  rules: TargetedRule[] = [],
): string[] {
  return evaluateGraphPolicy(topology, createWorkflowTopologyIndex(topology), policy, rules)
}

function defaultSemantics(): ConcurrencyPolicy<string> {
  return { pending: 'coalesce-latest', cancellation: 'retain-running', scope: [] }
}

function concurrency(group: string, cancelInProgress = false): WorkflowConcurrency {
  return {
    raw: { group, cancelInProgress },
    effective: { group, cancelInProgress, queue: 'single' },
  }
}

function lockFixture(): {
  topology: WorkflowTopology
  policy: Pick<WorkflowTopologyPolicy, 'jobInventory' | 'unlockedWorkflowReasons'>
  semantics: Record<string, ConcurrencyPolicy<string>>
} {
  const paths = ['one.yml', 'two.yml']
  return {
    topology: {
      schemaVersion: 1,
      workflows: paths.map(path => ({
        id: path,
        path,
        name: path,
        callable: false,
        triggers: [],
        jobIds: [],
        concurrency: concurrency('shared'),
      })),
      jobs: [],
      edges: [],
      diagnostics: [],
    },
    policy: { jobInventory: { 'one.yml': [], 'two.yml': [] }, unlockedWorkflowReasons: {} },
    semantics: {
      'one.yml': defaultSemantics(),
      'two.yml': defaultSemantics(),
    },
  }
}

describe('workflow topology policy diagnostics', () => {
  it('distinguishes mixed unlocked jobs from workflows whose jobs are all locked', () => {
    const fixture = lockFixture()
    const one = fixture.topology.workflows[0]!
    delete one.concurrency
    one.jobIds = ['one.yml#locked', 'one.yml#unlocked']
    fixture.topology.jobs.push(
      job('locked', [], 'one.yml', { concurrency: concurrency('job-lock') }),
      job('unlocked', [], 'one.yml'),
    )
    fixture.semantics['one.yml#locked'] = defaultSemantics()
    expect(evaluateLockPolicy(fixture.topology, fixture.policy, fixture.semantics)).toContain(
      'lock intent missing: one.yml',
    )
    fixture.topology.jobs[1]!.concurrency = concurrency('second-job-lock')
    fixture.semantics['one.yml#unlocked'] = defaultSemantics()
    const allLockedPolicy = {
      ...fixture.policy,
      unlockedWorkflowReasons: { 'one.yml': 'no longer unlocked' },
    }
    expect(evaluateLockPolicy(fixture.topology, allLockedPolicy, fixture.semantics)).toContain(
      'unlocked reason stale: one.yml',
    )
  })

  it('requires exact shared concurrency family membership', () => {
    const fixture = lockFixture()
    fixture.semantics['one.yml']!.sharedFamily = 'shared-global-state'
    fixture.semantics['two.yml']!.sharedFamily = 'shared-global-state'
    delete fixture.topology.workflows[1]!.concurrency
    const families = {
      'shared-staging-state': [],
      'shared-global-state': ['one.yml', 'two.yml'],
    } as const
    expect(
      evaluateLockPolicy(fixture.topology, fixture.policy, fixture.semantics, families),
    ).toContain(
      'shared concurrency family owners mismatch: shared-global-state: expected one.yml, two.yml, got one.yml',
    )
  })

  it('requires an exact allowlist row for every callable workflow', () => {
    const missing = graphPolicy()
    missing.exactCallerJobs = {}
    expect(evaluateGraph(graphTopology(), missing)).toContain(`caller allowlist missing: ${leaf}`)
    const stale = graphPolicy()
    stale.exactCallerJobs = { [leaf]: [id('call')], [root]: [] }
    expect(evaluateGraph(graphTopology(), stale)).toContain(`caller allowlist stale: ${root}`)
  })
  it('reports missing and stale lock intent', () => {
    const fixture = lockFixture()
    delete fixture.topology.workflows[0]?.concurrency
    expect(evaluateLockPolicy(fixture.topology, fixture.policy, fixture.semantics)).toContain(
      'lock intent stale: one.yml',
    )
    const staleReasonPolicy = {
      ...fixture.policy,
      unlockedWorkflowReasons: { 'two.yml': 'stale reason' },
    }
    expect(evaluateLockPolicy(fixture.topology, staleReasonPolicy, fixture.semantics)).toContain(
      'unlocked reason stale: two.yml',
    )
  })

  it('reports undeclared literal collisions and incompatible shared semantics', () => {
    const fixture = lockFixture()
    expect(evaluateLockPolicy(fixture.topology, fixture.policy, fixture.semantics)).toContain(
      'concurrency group collision undeclared: shared: one.yml, two.yml',
    )
    fixture.semantics['one.yml']!.sharedFamily = 'shared-global-state'
    fixture.semantics['two.yml']!.sharedFamily = 'shared-global-state'
    fixture.topology.workflows[1]!.concurrency = concurrency('shared', true)
    expect(evaluateLockPolicy(fixture.topology, fixture.policy, fixture.semantics)).toContain(
      'shared concurrency family incompatible: shared-global-state: one.yml, two.yml',
    )
  })

  it('reports missing and extra exact fan-in', () => {
    const topology = graphTopology()
    topology.edges = topology.edges.filter(edge => edge.kind !== 'needs' || edge.to !== id('b'))
    topology.edges.push({ kind: 'needs', from: id('c'), to: id('b') })
    expect(evaluateGraph(topology)).toContain(
      `exact fan-in mismatch: ${id('b')}: expected ${id('a')}, got ${id('c')}`,
    )
  })

  it('reports required and forbidden direct and transitive edges', () => {
    const topology = graphTopology()
    topology.edges = topology.edges.filter(
      edge => edge.kind !== 'needs' || edge.from !== id('a') || edge.to !== id('b'),
    )
    expect(evaluateGraph(topology)).toContain(
      `required direct edge missing: ${id('a')} -> ${id('b')}`,
    )
    topology.edges.push({ kind: 'needs', from: id('a'), to: id('c') })
    topology.edges.push({ kind: 'needs', from: id('c'), to: id('a') })
    const diagnostics = evaluateGraph(topology)
    expect(diagnostics).toContain(`forbidden direct edge present: ${id('a')} -> ${id('c')}`)
    expect(diagnostics).toContain(`forbidden transitive edge present: ${id('c')} -> ${id('a')}`)
  })

  it('reports a missing required artifact edge without treating needs as dataflow', () => {
    const topology = graphTopology()
    topology.edges = topology.edges.filter(edge => edge.kind !== 'artifact')

    expect(evaluateGraph(topology)).toContain(
      `required artifact edge missing: ${id('a')} -> ${id('b')}: results [exact]`,
    )
  })

  it('reports missing and unexpected reusable callers', () => {
    const policy = graphPolicy()
    policy.exactCallerJobs = { [leaf]: [id('a')] }
    expect(evaluateGraph(graphTopology(), policy)).toContain(
      `caller allowlist mismatch: ${leaf}: expected ${id('a')}, got ${id('call')}`,
    )
  })

  it('reports missing and forbidden jobs', () => {
    const policy = graphPolicy()
    policy.requiredJobs = [id('missing')]
    policy.forbiddenJobs = [id('a')]
    const diagnostics = evaluateGraph(graphTopology(), policy)
    expect(diagnostics).toContain(`required job missing: ${id('missing')}`)
    expect(diagnostics).toContain(`forbidden job present: ${id('a')}`)
  })

  it('reports missing and reordered eligibility steps', () => {
    const topology = graphTopology()
    topology.jobs.find(candidate => candidate.id === id('a'))!.steps.shift()
    expect(evaluateGraph(topology)).toContain(
      `required ordered step missing: ${id('a')}: eligibility`,
    )
    topology.jobs.find(candidate => candidate.id === id('a'))!.steps = [
      { index: 1, kind: 'action', id: 'eligibility' },
      { index: 0, kind: 'run', name: 'Mutate' },
    ]
    expect(evaluateGraph(topology)).toContain(`required step order invalid: ${id('a')}: Mutate`)
  })
})
