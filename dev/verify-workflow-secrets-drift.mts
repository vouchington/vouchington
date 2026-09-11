/**
 * Drift-shaping half of `verify-workflow-secrets.mts`, split out to stay under the 200-line
 * source cap. Same security constraint applies: diagnostics expose secret names and presence
 * only, never values.
 */
import type { SecretInventoryEntry } from '../.github/workflows/workflow-secrets-inventory.mts'

export interface SecretDrift {
  /** `provisioned: false` in the inventory, but `gh` sees it live — flip the flag to true. */
  readonly newlyProvisioned: string[]
  /** `provisioned: true` in the inventory, but `gh` does not see it live — investigate. */
  readonly notActuallyProvisioned: string[]
  /**
   * `neverProvision: true` in the inventory (a contract-only placeholder name, e.g.
   * `PROVIDER_API_TOKEN`), but `gh` sees it live anyway. Reported separately from
   * `newlyProvisioned` because the fix is to delete the live secret, not flip `provisioned`.
   */
  readonly accidentallyProvisioned: string[]
  /** Live secret name with no `SECRET_INVENTORY` entry at all (e.g. a Codespaces/Dependabot-only
   *  secret never referenced from `.github/workflows`) — informational, not a drift failure. */
  readonly unreferenced: string[]
  /** Environments `gh` could not be queried for (permissions, deleted mid-run, etc). */
  readonly warnings: string[]
}

export function diffAgainstInventory(
  inventory: Record<string, SecretInventoryEntry>,
  liveNames: ReadonlySet<string>,
  warnings: readonly string[],
): SecretDrift {
  const newlyProvisioned: string[] = []
  const notActuallyProvisioned: string[] = []
  const accidentallyProvisioned: string[] = []
  for (const [name, entry] of Object.entries(inventory)) {
    if (entry.neverProvision) {
      if (liveNames.has(name)) accidentallyProvisioned.push(name)
      continue
    }
    if (!entry.provisioned && liveNames.has(name)) newlyProvisioned.push(name)
    else if (entry.provisioned && !liveNames.has(name)) notActuallyProvisioned.push(name)
  }
  return {
    newlyProvisioned: newlyProvisioned.sort(),
    notActuallyProvisioned: notActuallyProvisioned.sort(),
    accidentallyProvisioned: accidentallyProvisioned.sort(),
    unreferenced: [...liveNames].filter(name => !Object.hasOwn(inventory, name)).sort(),
    warnings: [...warnings],
  }
}

/**
 * `confirmNames` entries not present in `liveNames` — the operator's explicit post-provisioning
 * checklist (`--confirm`) came up short. Independent of `SECRET_INVENTORY`'s `provisioned` flags:
 * a secret an operator just tried to provision can be skipped or misspelled while the inventory
 * itself still (correctly) says `provisioned: false`, which produces no drift above — this is the
 * targeted check for that gap.
 */
export function missingConfirmedSecrets(
  confirmNames: readonly string[],
  liveNames: ReadonlySet<string>,
): string[] {
  return confirmNames.filter(name => !liveNames.has(name))
}

/**
 * `drift.newlyProvisioned` names not covered by `--confirm`. A name the operator just confirmed
 * live is expected to still be `provisioned: false` in the inventory at this point — flipping that
 * flag is a separate follow-up commit, not something `--confirm` can do — so it must not fail the
 * command on its own. Any *other* newly-provisioned name is still unexplained drift and stays fatal.
 */
export function unconfirmedNewlyProvisioned(
  drift: SecretDrift,
  confirmNames: readonly string[],
): string[] {
  const confirmed = new Set(confirmNames)
  return drift.newlyProvisioned.filter(name => !confirmed.has(name))
}

export function formatDrift(drift: SecretDrift): string {
  const lines: string[] = []
  if (drift.newlyProvisioned.length > 0) {
    lines.push(
      'Now provisioned but still marked `provisioned: false` (flip it in workflow-secrets-inventory.mts):',
      ...drift.newlyProvisioned.map(name => `  - ${name}`),
    )
  }
  if (drift.notActuallyProvisioned.length > 0) {
    lines.push(
      'Marked `provisioned: true` but not visible to this gh session (deleted, renamed, or a token-scope gap — verify before editing):',
      ...drift.notActuallyProvisioned.map(name => `  - ${name}`),
    )
  }
  if (drift.accidentallyProvisioned.length > 0) {
    lines.push(
      'Marked `neverProvision: true` but provisioned live anyway (delete the live secret, do not flip `provisioned`):',
      ...drift.accidentallyProvisioned.map(name => `  - ${name}`),
    )
  }
  if (drift.unreferenced.length > 0) {
    lines.push(
      'Provisioned but not in SECRET_INVENTORY (fine if consumed outside .github/workflows, e.g. Dependabot/Codespaces):',
      ...drift.unreferenced.map(name => `  - ${name}`),
    )
  }
  for (const warning of drift.warnings) lines.push(`Warning: ${warning}`)
  if (lines.length === 0) lines.push('SECRET_INVENTORY matches the live secret store. No drift.')
  return `${lines.join('\n')}\n`
}
