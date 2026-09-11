import { describe, expect, it } from 'vitest'

import { SECRET_INVENTORY, type SecretInventoryEntry } from './workflow-secrets-inventory.mts'
import {
  collectSecretReferences,
  missingInventoryEntries,
  referencingWorkflowsByName,
  staleInventoryEntries,
  unprovisionedEntries,
} from './workflow-secrets-policy.mts'
import { unprovisionedSecretsWithoutReadinessStep } from './workflow-secrets-readiness.mts'
import {
  fixtureJob,
  fixtureTopology,
  fixtureWorkflow,
  INVENTORY_WITH_UNPROVISIONED_R2_DOCS,
} from './workflow-secrets-test-fixtures.mts'

describe('workflow secret inventory (fixtures)', () => {
  it('exempts GITHUB_TOKEN, which GitHub always injects, from the completeness check', () => {
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-a', 'fixture/wf-a.yml', { secretReferences: ['GITHUB_TOKEN'] })],
      [],
    )
    expect(missingInventoryEntries(topology)).toEqual([])
  })

  it('reports a referenced secret with no inventory entry as missing', () => {
    const topology = fixtureTopology(
      [
        fixtureWorkflow('wf-f', 'fixture/wf-f.yml', {
          secretReferences: ['UNKNOWN_FIXTURE_SECRET'],
        }),
      ],
      [],
    )
    expect(missingInventoryEntries(topology)).toEqual(['UNKNOWN_FIXTURE_SECRET'])
  })

  it('reports every inventory entry as stale when no workflow references it', () => {
    expect(staleInventoryEntries(fixtureTopology([], []))).toEqual(
      Object.keys(SECRET_INVENTORY).sort(),
    )
  })

  it('never surfaces step body text — only secret names and workflow paths', () => {
    // Security constraint (#8157): diagnostics expose secret names and presence only.
    // Plant unrelated decoy text right next to a real secret reference in the same step
    // and prove none of the diagnostic-producing functions ever echo it back. This holds
    // structurally, not by convention: workflow YAML never holds a resolved secret value
    // (`${{ secrets.NAME }}` is static expression text), so there is nothing to leak — this
    // test would fail the moment a function started threading step body/env text through.
    const decoy = 'DECOY-VALUE-should-never-appear-in-any-diagnostic'
    const topology = fixtureTopology(
      [fixtureWorkflow('wf-g', 'fixture/wf-g.yml')],
      [
        fixtureJob('wf-g#deploy', 'wf-g', {
          secretReferences: ['R2_DOCS_ACCESS_KEY_ID'],
          steps: [
            {
              index: 0,
              kind: 'run',
              env: { R2_DOCS_ACCESS_KEY_ID: '${{ secrets.R2_DOCS_ACCESS_KEY_ID }}' },
              run: `echo "unrelated ${decoy}"`,
            },
          ],
        }),
      ],
    )

    // R2_DOCS_ACCESS_KEY_ID is a real, currently-provisioned secret, but
    // `unprovisionedSecretsWithoutReadinessStep` only scans a step's `run` body (where the decoy
    // lives) for names it treats as unprovisioned — so without this override the real inventory
    // would make it skip this entry entirely, and the call below would never actually exercise the
    // run-body scan this test means to cover.
    const output = JSON.stringify([
      collectSecretReferences(topology),
      missingInventoryEntries(topology),
      staleInventoryEntries(topology),
      [...referencingWorkflowsByName(topology)],
      unprovisionedEntries(),
      unprovisionedSecretsWithoutReadinessStep(topology, INVENTORY_WITH_UNPROVISIONED_R2_DOCS),
    ])

    expect(output).not.toContain(decoy)
  })
})

describe('workflow secret inventory (repo inventory)', () => {
  it('keeps the auto-harness branch-policy check live-verified for the repo-scoped Harness key', () => {
    // HARNESS_API_KEY is intentionally repository-scoped (workflow_call does not resolve
    // Environment-scoped secrets), but dev/verify-workflow-secret-scopes.mts is trusted/local-only
    // and only exercised against fixtures in its own test file — nothing in CI otherwise notices a
    // silent regression if this field were ever deleted from the real inventory entry.
    const harnessEntry: SecretInventoryEntry = SECRET_INVENTORY.HARNESS_API_KEY
    expect(harnessEntry.requiredEnvironment).toBeUndefined()
    expect(harnessEntry.requiredBranchPolicy).toBe('auto-harness')
  })
})
