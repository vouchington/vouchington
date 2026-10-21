import type { WorkflowCallEdge, WorkflowJobNode } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

import { unprovisionedSecretsWithoutReadinessStep } from './workflow-secrets-readiness.mts'
import {
  fixtureCallableWorkflow,
  fixtureJob,
  fixtureTopology,
  fixtureWorkflow,
} from './workflow-secrets-test-fixtures.mts'

const INVENTORY_WITH_UNPROVISIONED_PROVIDER = {
  PROVIDER_API_TOKEN: {
    provisioned: false,
    neverProvision: true,
    notes: 'Synthetic optional workflow_call secret.',
  },
}

const SECRET = 'PROVIDER_API_TOKEN'
const CALLER_PATH = 'fixture/caller.yml'
const CALLEE_PATH = 'fixture/callee.yml'

function publishJob(): WorkflowJobNode {
  return fixtureJob('caller#publish', 'caller', { secretReferences: [SECRET] })
}

function callee(required: boolean) {
  return fixtureCallableWorkflow('callee', CALLEE_PATH, {
    [SECRET]: { required },
  })
}

function forwardEdge(job: WorkflowJobNode, required: boolean): WorkflowCallEdge {
  return {
    kind: 'calls',
    from: job.id,
    to: CALLEE_PATH,
    target: CALLEE_PATH,
    local: true,
    bindings: {
      inputs: {},
      secrets: {
        mode: 'explicit',
        values: {
          [SECRET]: required
            ? `\${{ secrets.${SECRET} }}`
            : `\${{ github.ref == 'refs/heads/main' && secrets.${SECRET} || '' }}`,
        },
      },
    },
  }
}

function readinessViolation(): string {
  return (
    `${CALLER_PATH}: "${SECRET}" is unprovisioned with no early-fail readiness step ` +
    '(expected a step binding `secrets.PROVIDER_API_TOKEN` to an env var, then ' +
    '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)'
  )
}

describe('unprovisionedSecretsWithoutReadinessStep — optional workflow_call forward', () => {
  it('clears a stepless caller that only forwards the secret to a required:false callee', () => {
    const job = publishJob()
    const topology = {
      ...fixtureTopology(
        [fixtureWorkflow('caller', CALLER_PATH, { jobIds: [job.id] }), callee(false)],
        [job],
      ),
      edges: [forwardEdge(job, false)],
    }

    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_PROVIDER),
    ).toEqual([])
  })

  it('still flags a forward when the callee requires the secret', () => {
    const job = publishJob()
    const topology = {
      ...fixtureTopology(
        [fixtureWorkflow('caller', CALLER_PATH, { jobIds: [job.id] }), callee(true)],
        [job],
      ),
      edges: [forwardEdge(job, true)],
    }

    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_PROVIDER),
    ).toEqual([readinessViolation()])
  })

  it('still flags a caller that also has an unguarded job referencing the secret', () => {
    const job = publishJob()
    const other = fixtureJob('caller#other', 'caller', { secretReferences: [SECRET] })
    const topology = {
      ...fixtureTopology(
        [fixtureWorkflow('caller', CALLER_PATH, { jobIds: [job.id, other.id] }), callee(false)],
        [job, other],
      ),
      edges: [forwardEdge(job, false)],
    }

    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_PROVIDER),
    ).toEqual([readinessViolation()])
  })

  it('still flags a forwarding job whose own step consumes the secret', () => {
    const job = fixtureJob('caller#publish', 'caller', {
      secretReferences: [SECRET],
      steps: [
        {
          index: 0,
          kind: 'run',
          env: { [SECRET]: `\${{ secrets.${SECRET} }}` },
          run: 'echo "$PROVIDER_API_TOKEN"',
          secretReferences: [SECRET],
        },
      ],
    })
    const topology = {
      ...fixtureTopology(
        [fixtureWorkflow('caller', CALLER_PATH, { jobIds: [job.id] }), callee(false)],
        [job],
      ),
      edges: [forwardEdge(job, false)],
    }

    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_PROVIDER),
    ).toEqual([readinessViolation()])
  })

  it('still flags a forward to a callee that does not declare the secret', () => {
    const job = publishJob()
    const topology = {
      ...fixtureTopology(
        [
          fixtureWorkflow('caller', CALLER_PATH, { jobIds: [job.id] }),
          fixtureCallableWorkflow('callee', CALLEE_PATH, {}),
        ],
        [job],
      ),
      edges: [forwardEdge(job, false)],
    }

    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_PROVIDER),
    ).toEqual([readinessViolation()])
  })

  it('still flags a forwarding job that also binds the secret in job env', () => {
    const job = { ...publishJob(), env: { TOKEN: `\${{ secrets.${SECRET} }}` } }
    const topology = {
      ...fixtureTopology(
        [fixtureWorkflow('caller', CALLER_PATH, { jobIds: [job.id] }), callee(false)],
        [job],
      ),
      edges: [forwardEdge(job, false)],
    }

    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_PROVIDER),
    ).toEqual([readinessViolation()])
  })

  it('still flags secrets: inherit and a workflow-scoped reference', () => {
    const inherited = publishJob()
    const scoped = publishJob()
    const inheritTopology = {
      ...fixtureTopology(
        [fixtureWorkflow('caller', CALLER_PATH, { jobIds: [inherited.id] }), callee(false)],
        [inherited],
      ),
      edges: [
        {
          ...forwardEdge(inherited, false),
          bindings: { inputs: {}, secrets: { mode: 'inherit' as const } },
        },
      ],
    }
    const scopedTopology = {
      ...fixtureTopology(
        [
          fixtureWorkflow('caller', CALLER_PATH, {
            jobIds: [scoped.id],
            secretReferences: [SECRET],
          }),
          callee(false),
        ],
        [scoped],
      ),
      edges: [forwardEdge(scoped, false)],
    }

    expect(
      unprovisionedSecretsWithoutReadinessStep(
        inheritTopology,
        INVENTORY_WITH_UNPROVISIONED_PROVIDER,
      ),
    ).toEqual([readinessViolation()])
    expect(
      unprovisionedSecretsWithoutReadinessStep(
        scopedTopology,
        INVENTORY_WITH_UNPROVISIONED_PROVIDER,
      ),
    ).toEqual([readinessViolation()])
  })
})
