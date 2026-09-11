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
 *  cover the `if:` condition-entailment logic in `hasReadinessStep` — the check that a guard
 *  step's condition is guaranteed to hold whenever a protected consumer step's own condition does,
 *  not just that the guard is unconditional. */
const R2_READINESS_STEP: WorkflowStep = {
  index: 0,
  kind: 'run',
  env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
  run: 'if [ -z "$R2_DOCS_ACCESS_KEY_ID" ]; then echo "::error::missing"; exit 1; fi',
}

/** Shared `if:` clause text, reused verbatim between guard and consumer conditions below so the
 *  entailment check compares identical substrings. */
const PUBLISH_CLAUSE = "steps.metadata.outputs.publish == 'true'"
const CLEANUP_CLAUSE = "steps.metadata.outputs.cleanup == 'true'"
const CANARY_CLAUSE = "vars.STORYBOOK_PAGES_CANARY_VERIFIED == 'true'"

describe('unprovisionedSecretsWithoutReadinessStep — condition entailment', () => {
  it('does not accept a guard whose condition requires more than every consumer requires', () => {
    // Guard is gated on an extra clause (PUBLISH) the consumer's own condition doesn't share, so
    // the consumer can run on a path (CANARY true, PUBLISH false) where the guard is skipped.
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-q', 'fixture/wf-q.yml')],
      [
        fixtureJob('wf-q#deploy', 'wf-q', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              ...R2_READINESS_STEP,
              condition: `${PUBLISH_CLAUSE} && ${CANARY_CLAUSE}`,
            },
            {
              index: 1,
              kind: 'run',
              condition: CANARY_CLAUSE,
              run: 'aws s3 cp ./dist s3://bucket --profile ci',
              secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
            },
          ],
        }),
      ],
    )
    expect(
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ).toEqual([
      'fixture/wf-q.yml: "R2_DOCS_ACCESS_KEY_ID" is unprovisioned with no early-fail readiness step ' +
        '(expected a step binding `secrets.R2_DOCS_ACCESS_KEY_ID` to an env var, then ' +
        '`if [ -z "$VAR" ]; then ...; exit 1; fi` — see harness-dispatch.yml)',
    ])
  })

  it('still accepts a readiness step gated only by `always()`, whatever the consumer requires', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-r', 'fixture/wf-r.yml')],
      [
        fixtureJob('wf-r#deploy', 'wf-r', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            { ...R2_READINESS_STEP, condition: 'always()' },
            {
              index: 1,
              kind: 'run',
              condition: CANARY_CLAUSE,
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

  it('accepts a guard condition identical to its one consumer condition', () => {
    const validateOutcomeClause = "steps.validate.outcome == 'success'"
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-s', 'fixture/wf-s.yml')],
      [
        fixtureJob('wf-s#plan-global', 'wf-s', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            { ...R2_READINESS_STEP, condition: validateOutcomeClause },
            {
              index: 1,
              kind: 'run',
              condition: validateOutcomeClause,
              run: 'publish artifact',
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

  it('accepts a guard OR-ing each consumer condition under a shared gate', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-t', 'fixture/wf-t.yml')],
      [
        fixtureJob('wf-t#publish', 'wf-t', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              ...R2_READINESS_STEP,
              condition: `(${PUBLISH_CLAUSE} || ${CLEANUP_CLAUSE}) && ${CANARY_CLAUSE}`,
            },
            {
              index: 1,
              kind: 'run',
              condition: `${PUBLISH_CLAUSE} && ${CANARY_CLAUSE}`,
              run: 'aws s3 cp ./dist s3://bucket --profile ci',
              secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
            },
            {
              index: 2,
              kind: 'run',
              condition: `${CLEANUP_CLAUSE} && ${CANARY_CLAUSE}`,
              run: 'aws s3 rm s3://bucket/preview --recursive --profile ci',
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
})
