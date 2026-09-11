import type { WorkflowStep } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

import { unprovisionedSecretsWithoutReadinessStep } from './workflow-secrets-readiness.mts'
import {
  fixtureCallableWorkflow,
  fixtureJob,
  fixtureTopology,
  fixtureWorkflow,
  INVENTORY_WITH_UNPROVISIONED_R2_DOCS,
} from './workflow-secrets-test-fixtures.mts'

/** A step that binds and early-fails on R2_DOCS_ACCESS_KEY_ID, reused via
 *  `{ ...R2_READINESS_STEP, condition: ... }` to avoid repeating its `env`/`run`. Condition-entailment
 *  coverage lives in workflow-secrets-readiness-conditions.test.mts (split to stay under the 300-line
 *  test cap). */
const R2_READINESS_STEP: WorkflowStep = {
  index: 0,
  kind: 'run',
  env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
  run: 'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then echo "::error::missing"; exit 1; fi',
}

const INVENTORY_WITH_UNPROVISIONED_PROVIDER = {
  PROVIDER_API_TOKEN: {
    provisioned: false,
    neverProvision: true,
    notes: 'Synthetic optional workflow_call secret.',
  },
}

describe('unprovisionedSecretsWithoutReadinessStep', () => {
  it('flags a real unprovisioned secret when its consuming workflow has no readiness step', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-b', 'fixture/wf-b.yml')],
      [fixtureJob('wf-b#deploy', 'wf-b', { secretReferences: ['R2_DOCS_ACCESS_KEY_ID'] })],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-b.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('requires every consuming job to have its own readiness step, not just one', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-h', 'fixture/wf-h.yml')],
      [
        fixtureJob('wf-h#deploy-a', 'wf-h', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              index: 0,
              kind: 'run',
              env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
              run: 'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then echo "::error::missing"; exit 1; fi',
            },
          ],
        }),
        fixtureJob('wf-h#deploy-b', 'wf-h', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-h.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('does not accept a commented-out exit 1 as a readiness step', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-i', 'fixture/wf-i.yml')],
      [
        fixtureJob('wf-i#deploy', 'wf-i', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              index: 0,
              kind: 'run',
              env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
              run:
                'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then\n' +
                '  echo "::error::missing"\n' +
                '  # exit 1\n' +
                'fi',
            },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-i.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('does not accept an inline trailing comment `# exit 1` as a readiness step', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-k', 'fixture/wf-k.yml')],
      [
        fixtureJob('wf-k#deploy', 'wf-k', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              index: 0,
              kind: 'run',
              env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
              run: 'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then echo "::error::missing" # exit 1\nfi',
            },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-k.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('does not treat a `#` inside a quoted string as a comment, so a real exit 1 still counts', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-l', 'fixture/wf-l.yml')],
      [
        fixtureJob('wf-l#deploy', 'wf-l', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              index: 0,
              kind: 'run',
              env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
              run: 'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then echo "missing # not a comment"; exit 1; fi',
            },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([])
  })

  it('requires the readiness step to precede every other step that consumes the secret', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-m', 'fixture/wf-m.yml')],
      [
        fixtureJob('wf-m#deploy', 'wf-m', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              index: 0,
              kind: 'run',
              run: 'aws s3 cp ./dist s3://bucket --profile ci',
              secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
            },
            {
              index: 1,
              kind: 'run',
              env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
              run: 'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then echo "::error::missing"; exit 1; fi',
              secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
            },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-m.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('clears the violation when the readiness step runs before the step that consumes the secret', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-n', 'fixture/wf-n.yml')],
      [
        fixtureJob('wf-n#deploy', 'wf-n', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              index: 0,
              kind: 'run',
              env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
              run: 'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then echo "::error::missing"; exit 1; fi',
              secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
            },
            {
              index: 1,
              kind: 'run',
              run: 'aws s3 cp ./dist s3://bucket --profile ci',
              secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
            },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([])
  })

  it('clears the violation once a step early-fails on the missing secret', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-c', 'fixture/wf-c.yml')],
      [
        fixtureJob('wf-c#deploy', 'wf-c', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              index: 0,
              kind: 'run',
              env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
              run: 'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then echo "::error::missing"; exit 1; fi',
            },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([])
  })

  it('exempts a required:false workflow_call secret at its declaring callee workflow', () => {
    const topology = fixtureTopology(
      [
        fixtureCallableWorkflow('wf-d', 'fixture/wf-d.yml', {
          PROVIDER_API_TOKEN: { required: false },
        }),
      ],
      [fixtureJob('wf-d#review', 'wf-d', { secretReferences: ['PROVIDER_API_TOKEN'] })],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_PROVIDER),
    ).toEqual([])
  })

  it('does not extend the required:false exemption to a non-declaring workflow', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-e', 'fixture/wf-e.yml')],
      [fixtureJob('wf-e#review', 'wf-e', { secretReferences: ['PROVIDER_API_TOKEN'] })],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_PROVIDER),
    ).toEqual([
      'fixture/wf-e.yml: "PROVIDER_API_TOKEN" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.PROVIDER_API_TOKEN` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('attributes a workflow-scope-only secret reference to every job in the workflow', () => {
    const topology = fixtureTopology(
      [
        fixtureWorkflow('wf-o', 'fixture/wf-o.yml', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
        }),
      ],
      [fixtureJob('wf-o#deploy', 'wf-o', { steps: [] })],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-o.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('clears a workflow-scope-only reference once every job has its own readiness step', () => {
    const topology = fixtureTopology(
      [
        fixtureWorkflow('wf-p', 'fixture/wf-p.yml', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
        }),
      ],
      [fixtureJob('wf-p#deploy', 'wf-p', { steps: [R2_READINESS_STEP] })],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([])
  })
})
