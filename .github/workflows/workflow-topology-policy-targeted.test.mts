import { describe, expect, it } from 'vitest'

import {
  createWorkflowTopologyIndex,
  type WorkflowJobNode,
  type WorkflowTopology,
} from 'no-mistakes'
import { evaluateGraphPolicy } from './workflow-topology-policy-graph.mts'
import type {
  TargetedRerunPolicy,
  TargetedRule,
  WorkflowTopologyPolicy,
} from './workflow-topology-policy-types.mts'
import { BASE_PERMISSIONS } from './workflow-secrets-test-fixtures.mts'

const outer = '.github/workflows/outer.yml'
const inner = '.github/workflows/inner.yml'
const caller = `${outer}#call`
const outerConsumer = `${outer}#consumer`
const unrelated = `${outer}#unrelated`
const target = `${inner}#target`
const innerConsumer = `${inner}#consumer`
const rerunTargetJobName = 'call / target'
const targetedRule = { id: 'targeted', rerunTarget: { jobName: rerunTargetJobName } }

function job(id: string, workflowId: string, key: string): WorkflowJobNode {
  return { id, workflowId, key, kind: 'job', steps: [], permissions: BASE_PERMISSIONS }
}

function topology(): WorkflowTopology {
  return {
    schemaVersion: 1,
    workflows: [
      {
        id: outer,
        path: outer,
        name: 'Outer',
        callable: false,
        triggers: [],
        jobIds: [caller, outerConsumer, unrelated],
      },
      {
        id: inner,
        path: inner,
        name: 'Inner',
        callable: true,
        workflowCall: { inputs: {}, secrets: {}, outputs: {} },
        triggers: [],
        jobIds: [target, innerConsumer],
      },
    ],
    jobs: [
      job(caller, outer, 'call'),
      job(outerConsumer, outer, 'consumer'),
      job(unrelated, outer, 'unrelated'),
      job(target, inner, 'target'),
      job(innerConsumer, inner, 'consumer'),
    ],
    edges: [
      {
        kind: 'calls',
        from: caller,
        to: inner,
        target: `./${inner}`,
        local: true,
        bindings: { inputs: {}, secrets: { mode: 'explicit', values: {} } },
      },
      { kind: 'needs', from: caller, to: outerConsumer },
      { kind: 'needs', from: target, to: innerConsumer },
    ],
    diagnostics: [],
  }
}

function policy(): WorkflowTopologyPolicy {
  return {
    jobInventory: {
      [outer]: ['call', 'consumer', 'unrelated'],
      [inner]: ['consumer', 'target'],
    },
    unlockedWorkflowReasons: { [outer]: 'parallel-safe', [inner]: 'caller-serialized' },
    requiredJobs: [],
    forbiddenJobs: [],
    requiredDirectEdges: [],
    forbiddenDirectEdges: [],
    requiredTransitiveEdges: [],
    forbiddenTransitiveEdges: [],
    requiredArtifactEdges: [],
    exactFanIns: {},
    exactCallerJobs: { [inner]: [caller] },
    stepOrders: [],
    targetedReruns: {
      targeted: {
        innerTargetJob: target,
        rerunTargetJobName,
        innerDownstreamJobs: [innerConsumer],
        outerCallers: { [caller]: [outerConsumer] },
      },
    },
  }
}

type TargetedOverrides = Partial<
  Pick<TargetedRerunPolicy, 'innerTargetJob' | 'innerDownstreamJobs' | 'outerCallers'>
>

function withTargeted(overrides: TargetedOverrides): WorkflowTopologyPolicy {
  const configured = policy()
  configured.targetedReruns = {
    targeted: { ...configured.targetedReruns.targeted!, ...overrides },
  }
  return configured
}

function diagnostics(
  configuredPolicy: WorkflowTopologyPolicy,
  rules: TargetedRule[] = [targetedRule],
): string[] {
  const fixture = topology()
  return evaluateGraphPolicy(fixture, createWorkflowTopologyIndex(fixture), configuredPolicy, rules)
}

describe('targeted rerun topology policy diagnostics', () => {
  it('reports an undeclared targeted rule', () => {
    const configured = policy()
    configured.targetedReruns = {}
    expect(diagnostics(configured)).toContain('targeted rerun policy missing: targeted')
  })

  it('reports a stale targeted policy row', () => {
    expect(diagnostics(policy(), [])).toContain('targeted rerun policy stale: targeted')
  })

  it('reports a missing target job', () => {
    const configured = withTargeted({ innerTargetJob: `${inner}#missing` })
    expect(diagnostics(configured)).toContain(
      `targeted rerun target missing: targeted: ${inner}#missing`,
    )
  })

  it('reports a rerun target job-name identity mismatch', () => {
    expect(
      diagnostics(policy(), [
        { id: 'targeted', rerunTarget: { jobName: 'call / different-target' } },
      ]),
    ).toContain(
      'targeted rerun job name mismatch: targeted: expected call / target, got call / different-target',
    )
  })

  it('accepts a family rule matching a family policy row', () => {
    const configured = policy()
    configured.targetedReruns = {
      targeted: {
        innerTargetJob: target,
        rerunTargetJobNameFamily: 'call / target (',
        innerDownstreamJobs: [innerConsumer],
        outerCallers: { [caller]: [outerConsumer] },
      },
    }
    const rule = {
      id: 'targeted',
      rerunTarget: { jobNameFamily: 'call / target (', resolveJobName: () => null },
    }
    expect(diagnostics(configured, [rule])).toEqual([])
  })

  it('reports a shape mismatch when the rule is exact-name but the row is a job-name family', () => {
    const configured = policy()
    configured.targetedReruns = {
      targeted: {
        innerTargetJob: target,
        rerunTargetJobNameFamily: 'call / target (',
        innerDownstreamJobs: [innerConsumer],
        outerCallers: { [caller]: [outerConsumer] },
      },
    }
    expect(diagnostics(configured)).toContain(
      `targeted rerun shape mismatch: rule targeted declares exact jobName "${rerunTargetJobName}", but policy row declares jobNameFamily "call / target ("`,
    )
  })

  it('reports a shape mismatch when the rule is a job-name family but the row is exact-name', () => {
    expect(
      diagnostics(policy(), [
        {
          id: 'targeted',
          rerunTarget: { jobNameFamily: 'call / target (', resolveJobName: () => null },
        },
      ]),
    ).toContain(
      `targeted rerun shape mismatch: rule targeted declares jobNameFamily "call / target (", but policy row declares exact jobName "${rerunTargetJobName}"`,
    )
  })

  it('reports an omitted inner downstream consumer', () => {
    const configured = withTargeted({ innerDownstreamJobs: [] })
    expect(diagnostics(configured)).toContain(
      `targeted rerun inner downstream policy missing: targeted: ${target} -> ${innerConsumer}`,
    )
  })

  it('reports a missing inner consumer', () => {
    const configured = withTargeted({ innerDownstreamJobs: [`${inner}#missing`] })
    expect(diagnostics(configured)).toContain(
      `targeted rerun inner consumer missing: targeted: ${inner}#missing`,
    )
  })

  it('reports an existing inner consumer outside the target downstream closure', () => {
    const configured = withTargeted({ innerDownstreamJobs: [target] })
    expect(diagnostics(configured)).toContain(
      `targeted rerun inner downstream policy stale: targeted: ${target} -> ${target}`,
    )
  })

  it('requires every actual outer caller in the policy', () => {
    const configured = withTargeted({ outerCallers: {} })
    expect(diagnostics(configured)).toContain(
      `targeted rerun outer caller policy missing: targeted: ${caller}`,
    )
  })

  it('reports a missing outer caller', () => {
    const configured = withTargeted({ outerCallers: { [`${outer}#missing`]: [] } })
    expect(diagnostics(configured)).toContain(
      `targeted rerun outer caller missing: targeted: ${outer}#missing`,
    )
    expect(diagnostics(configured)).toContain(
      `targeted rerun outer caller policy stale: targeted: ${outer}#missing`,
    )
  })

  it('reports an existing job that does not call the targeted workflow', () => {
    const configured = withTargeted({ outerCallers: { [unrelated]: [] } })
    expect(diagnostics(configured)).toContain(
      `targeted rerun outer caller mismatch: targeted: ${unrelated} -> ${inner}`,
    )
    expect(diagnostics(configured)).toContain(
      `targeted rerun outer caller policy stale: targeted: ${unrelated}`,
    )
  })

  it('reports a missing outer consumer', () => {
    const missing = `${outer}#missing-consumer`
    const configured = withTargeted({ outerCallers: { [caller]: [missing] } })
    expect(diagnostics(configured)).toContain(
      `targeted rerun outer consumer missing: targeted: ${missing}`,
    )
  })

  it('reports an omitted outer downstream consumer', () => {
    const configured = withTargeted({ outerCallers: { [caller]: [] } })
    expect(diagnostics(configured)).toContain(
      `targeted rerun outer downstream policy missing: targeted: ${caller} -> ${outerConsumer}`,
    )
  })

  it('reports a missing outer downstream closure', () => {
    const configured = withTargeted({ outerCallers: { [caller]: [unrelated] } })
    expect(diagnostics(configured)).toContain(
      `targeted rerun outer downstream policy stale: targeted: ${caller} -> ${unrelated}`,
    )
  })
})
