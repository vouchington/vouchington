import type { WorkflowCallEdge, WorkflowJobNode } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

import { unprovisionedSecretsWithoutReadinessStep } from './workflow-secrets-readiness.mts'
import {
  fixtureCallableWorkflow,
  fixtureJob,
  fixtureTopology,
  fixtureWorkflow,
} from './workflow-secrets-test-fixtures.mts'

const SECRET = 'PROVIDER_API_TOKEN'
const CALLER_PATH = 'fixture/caller.yml'
const CALLEE_PATH = 'fixture/callee.yml'
const INVENTORY = {
  PROVIDER_API_TOKEN: {
    provisioned: false,
    neverProvision: true,
    notes: 'Synthetic optional workflow_call secret.',
  },
}

function publishJob(): WorkflowJobNode {
  return fixtureJob('caller#publish', 'caller', { secretReferences: [SECRET] })
}

function explicitEdge(job: WorkflowJobNode, values: Record<string, string>): WorkflowCallEdge {
  return {
    kind: 'calls',
    from: job.id,
    to: CALLEE_PATH,
    target: CALLEE_PATH,
    local: true,
    bindings: { inputs: {}, secrets: { mode: 'explicit', values } },
  }
}

describe('optional secret forwards with mixed consumers and aliased bindings', () => {
  it('clears a workflow whose other consumer already has a readiness step', () => {
    const forward = publishJob()
    const guarded = fixtureJob('caller#deploy', 'caller', {
      secretReferences: [SECRET],
      steps: [
        {
          index: 0,
          kind: 'run',
          env: { [SECRET]: `\${{ secrets.${SECRET} }}` },
          run: 'if [ -z "$PROVIDER_API_TOKEN" ]; then echo "::error::missing"; exit 1; fi',
          secretReferences: [SECRET],
        },
      ],
    })
    const topology = {
      ...fixtureTopology(
        [
          fixtureWorkflow('caller', CALLER_PATH, { jobIds: [forward.id, guarded.id] }),
          fixtureCallableWorkflow('callee', CALLEE_PATH, { [SECRET]: { required: false } }),
        ],
        [forward, guarded],
      ),
      edges: [explicitEdge(forward, { [SECRET]: `\${{ secrets.${SECRET} }}` })],
    }

    expect(unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY)).toEqual([])
  })

  it('clears an alias that forwards the source secret to a required:false destination', () => {
    const job = publishJob()
    const topology = {
      ...fixtureTopology(
        [
          fixtureWorkflow('caller', CALLER_PATH, { jobIds: [job.id] }),
          fixtureCallableWorkflow('callee', CALLEE_PATH, {
            OPTIONAL_TOKEN: { required: false },
          }),
        ],
        [job],
      ),
      edges: [explicitEdge(job, { OPTIONAL_TOKEN: `\${{ secrets.${SECRET} }}` })],
    }

    expect(unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY)).toEqual([])
  })

  it('still flags a source secret that also binds a required destination', () => {
    const job = publishJob()
    const topology = {
      ...fixtureTopology(
        [
          fixtureWorkflow('caller', CALLER_PATH, { jobIds: [job.id] }),
          fixtureCallableWorkflow('callee', CALLEE_PATH, {
            [SECRET]: { required: false },
            REQUIRED_TOKEN: { required: true },
          }),
        ],
        [job],
      ),
      edges: [
        explicitEdge(job, {
          [SECRET]: `\${{ secrets.${SECRET} }}`,
          REQUIRED_TOKEN: `\${{ secrets.${SECRET} }}`,
        }),
      ],
    }

    expect(unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY)).toEqual([
      `${CALLER_PATH}: "${SECRET}" is unprovisioned with no early-fail readiness step ` +
        '(expected a step binding `secrets.PROVIDER_API_TOKEN` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })
})
