import type { WorkflowStep } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

import { unprovisionedSecretsWithoutReadinessStep } from './workflow-secrets-readiness.mts'
import {
  fixtureJob,
  fixtureTopology,
  fixtureWorkflow,
  INVENTORY_WITH_UNPROVISIONED_R2_DOCS,
} from './workflow-secrets-test-fixtures.mts'

/** Split out of workflow-secrets-readiness.test.mts (which stays under the 300-line test cap) to
 *  cover a job whose only reference to the secret is job-scoped (a job-level `env:`), so no
 *  individual step carries its own `secretReferences` for it. `hasReadinessStep` must then treat
 *  every step in the job as a possible consumer — not zero — since it can't know which step
 *  actually reads the inherited value from its environment. */
const R2_READINESS_STEP: WorkflowStep = {
  index: 0,
  kind: 'run',
  env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
  run: 'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then echo "::error::missing"; exit 1; fi',
}

describe('unprovisionedSecretsWithoutReadinessStep — job-scope-only reference', () => {
  it('does not let a job-scope-only reference vacuously pass a guard placed after another step', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-u', 'fixture/wf-u.yml')],
      [
        fixtureJob('wf-u#deploy', 'wf-u', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            { index: 0, kind: 'run', run: 'echo setting up' },
            { ...R2_READINESS_STEP, index: 1 },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-u.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('clears a job-scope-only reference once the readiness step runs first', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-v', 'fixture/wf-v.yml')],
      [
        fixtureJob('wf-v#deploy', 'wf-v', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [R2_READINESS_STEP, { index: 1, kind: 'run', run: 'echo deploying' }],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([])
  })
})

describe('unprovisionedSecretsWithoutReadinessStep — workflow-scope reference alongside a direct job reference', () => {
  it('still validates a job that only inherits the workflow-scoped value, even though another job references it directly', () => {
    const topology = fixtureTopology(
      [
        fixtureWorkflow('wf-w', 'fixture/wf-w.yml', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
        }),
      ],
      [
        fixtureJob('wf-w#guarded', 'wf-w', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [R2_READINESS_STEP],
        }),
        // No direct reference of its own — inherits solely from the workflow-scoped `env:` — and
        // has no readiness step. The old fallback only expanded to "all jobs" when there were zero
        // *direct* consumers; since `guarded` above references the secret directly, this job was
        // silently dropped from validation even though it inherits the same unprovisioned value.
        fixtureJob('wf-w#unguarded', 'wf-w', { steps: [] }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-w.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('clears once every job inheriting the workflow-scoped value has its own readiness step', () => {
    const topology = fixtureTopology(
      [
        fixtureWorkflow('wf-x', 'fixture/wf-x.yml', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
        }),
      ],
      [
        fixtureJob('wf-x#guarded-a', 'wf-x', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [R2_READINESS_STEP],
        }),
        fixtureJob('wf-x#guarded-b', 'wf-x', { steps: [R2_READINESS_STEP] }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([])
  })
})

// A readiness step must bind `${{ secrets.NAME }}` itself to test it, so — unlike `R2_READINESS_STEP`
// above — the real no-mistakes parser also records that binding in the step's own `secretReferences`.
// That self-reference must never be mistaken for "every reference in this job is step-scoped," since
// the job below also carries a job-scoped reference that an *other*, unguarded step can consume.
const R2_READINESS_STEP_WITH_OWN_REF: WorkflowStep = {
  ...R2_READINESS_STEP,
  secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
}

describe("unprovisionedSecretsWithoutReadinessStep — job-scoped reference alongside the guard's own step-level self-reference", () => {
  it('still catches an earlier step that consumes only the inherited job-scoped value, even though the readiness step’s own secrets.NAME binding makes it a step-level consumer too', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-y', 'fixture/wf-y.yml')],
      [
        fixtureJob('wf-y#deploy', 'wf-y', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              index: 0,
              kind: 'run',
              run: ['aws s3 cp ./dist s3:/', '/docs --profile r2'].join(''),
            },
            { ...R2_READINESS_STEP_WITH_OWN_REF, index: 1 },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-y.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('clears once the self-referencing readiness step runs before the step that only consumes the inherited value', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-z', 'fixture/wf-z.yml')],
      [
        fixtureJob('wf-z#deploy', 'wf-z', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            R2_READINESS_STEP_WITH_OWN_REF,
            {
              index: 1,
              kind: 'run',
              run: ['aws s3 cp ./dist s3:/', '/docs --profile r2'].join(''),
            },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([])
  })
})
