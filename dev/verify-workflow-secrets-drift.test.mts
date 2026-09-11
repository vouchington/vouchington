import { describe, expect, it } from 'vitest'

import {
  diffAgainstInventory,
  formatDrift,
  missingConfirmedSecrets,
  unconfirmedNewlyProvisioned,
} from './verify-workflow-secrets-drift.mts'

import type { SecretInventoryEntry } from '../.github/workflows/workflow-secrets-inventory.mts'

const FIXTURE_INVENTORY: Record<string, SecretInventoryEntry> = {
  ALREADY_PROVISIONED: { provisioned: true, notes: 'fixture' },
  NOT_YET_PROVISIONED: { provisioned: false, notes: 'fixture' },
  NEVER_PROVISION_FIXTURE: { provisioned: false, neverProvision: true, notes: 'fixture' },
}

describe('diffAgainstInventory', () => {
  it('flags a provisioned:false entry that gh now sees as live', () => {
    const drift = diffAgainstInventory(FIXTURE_INVENTORY, new Set(['NOT_YET_PROVISIONED']), [])
    expect(drift.newlyProvisioned).toEqual(['NOT_YET_PROVISIONED'])
    expect(drift.notActuallyProvisioned).toEqual(['ALREADY_PROVISIONED'])
  })

  it('reports no drift when the inventory matches the live store exactly', () => {
    const drift = diffAgainstInventory(FIXTURE_INVENTORY, new Set(['ALREADY_PROVISIONED']), [])
    expect(drift).toEqual({
      newlyProvisioned: [],
      notActuallyProvisioned: [],
      accidentallyProvisioned: [],
      unreferenced: [],
      warnings: [],
    })
  })

  it('lists a live secret with no inventory entry as unreferenced, not a failure', () => {
    const drift = diffAgainstInventory(
      FIXTURE_INVENTORY,
      new Set(['ALREADY_PROVISIONED', 'CODESPACES_ONLY_SECRET']),
      [],
    )
    expect(drift.unreferenced).toEqual(['CODESPACES_ONLY_SECRET'])
    expect(drift.newlyProvisioned).toEqual([])
    expect(drift.notActuallyProvisioned).toEqual([])
  })

  it('reports a neverProvision:true name seen live as accidentallyProvisioned, not newlyProvisioned', () => {
    const drift = diffAgainstInventory(
      FIXTURE_INVENTORY,
      new Set(['ALREADY_PROVISIONED', 'NEVER_PROVISION_FIXTURE']),
      [],
    )
    expect(drift.accidentallyProvisioned).toEqual(['NEVER_PROVISION_FIXTURE'])
    expect(drift.newlyProvisioned).toEqual([])
  })

  it('does not flag a neverProvision:true name absent from the live store', () => {
    const drift = diffAgainstInventory(FIXTURE_INVENTORY, new Set(['ALREADY_PROVISIONED']), [])
    expect(drift.accidentallyProvisioned).toEqual([])
    expect(drift.notActuallyProvisioned).toEqual([])
  })
})

describe('formatDrift', () => {
  it('never renders a secret value — only names, never appear alongside a value-shaped field', () => {
    const report = formatDrift(
      diffAgainstInventory(FIXTURE_INVENTORY, new Set(['NOT_YET_PROVISIONED']), [
        'Could not list secrets for environment "global": HTTP 404: Not Found',
      ]),
    )
    expect(report).toContain('NOT_YET_PROVISIONED')
    expect(report).toContain('ALREADY_PROVISIONED')
    expect(report).toContain('Warning: Could not list secrets for environment "global"')
  })

  it('reports a clean bill of health when nothing drifted', () => {
    const drift = diffAgainstInventory(FIXTURE_INVENTORY, new Set(['ALREADY_PROVISIONED']), [])
    expect(formatDrift(drift)).toBe('SECRET_INVENTORY matches the live secret store. No drift.\n')
  })

  it('tells the reader to delete the live secret, not flip provisioned, for an accidental match', () => {
    const drift = diffAgainstInventory(
      FIXTURE_INVENTORY,
      new Set(['ALREADY_PROVISIONED', 'NEVER_PROVISION_FIXTURE']),
      [],
    )
    const report = formatDrift(drift)
    expect(report).toContain('NEVER_PROVISION_FIXTURE')
    expect(report).toContain('delete the live secret, do not flip `provisioned`')
  })
})

describe('missingConfirmedSecrets', () => {
  it('returns nothing when every confirmed name is live', () => {
    const missing = missingConfirmedSecrets(
      ['R2_DOCS_ACCESS_KEY_ID'],
      new Set(['R2_DOCS_ACCESS_KEY_ID', 'ALREADY_PROVISIONED']),
    )
    expect(missing).toEqual([])
  })

  it('catches a skipped or misspelled provisioning step even when the inventory sees no drift', () => {
    const missing = missingConfirmedSecrets(
      ['R2_DOCS_ACCESS_KEY_ID', 'R2_DOCS_SECRET_ACCESS_KEY'],
      new Set(['R2_DOCS_ACCESS_KEY_ID']),
    )
    expect(missing).toEqual(['R2_DOCS_SECRET_ACCESS_KEY'])
  })

  it('returns nothing when no names were passed to confirm', () => {
    expect(missingConfirmedSecrets([], new Set(['ALREADY_PROVISIONED']))).toEqual([])
  })
})

describe('unconfirmedNewlyProvisioned', () => {
  it('excludes a newly-provisioned name that --confirm covers', () => {
    const drift = diffAgainstInventory(FIXTURE_INVENTORY, new Set(['NOT_YET_PROVISIONED']), [])
    expect(unconfirmedNewlyProvisioned(drift, ['NOT_YET_PROVISIONED'])).toEqual([])
  })

  it('still surfaces a newly-provisioned name that --confirm does not cover', () => {
    const drift = diffAgainstInventory(FIXTURE_INVENTORY, new Set(['NOT_YET_PROVISIONED']), [])
    expect(unconfirmedNewlyProvisioned(drift, [])).toEqual(['NOT_YET_PROVISIONED'])
    expect(unconfirmedNewlyProvisioned(drift, ['ALREADY_PROVISIONED'])).toEqual([
      'NOT_YET_PROVISIONED',
    ])
  })
})
