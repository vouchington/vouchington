import type { SharedContext } from 'vouchington-tooling/shared-context'

import { collectLicenseReport, type LicenseReport } from './collect-licenses.mts'
import { evaluatePackageLicenseExpression } from './policy.mts'

export { collectLicenseReport } from './collect-licenses.mts'
export type { LicenseReport, LicenseReportEntry, PnpmExecutor } from './collect-licenses.mts'
export { evaluatePackageLicenseExpression } from './policy.mts'

/**
 * Fails when a dependency's license is on the issue #158 deny list (GPL,
 * AGPL, EPL, CDDL, SSPL, BUSL, or a genuinely unlicensed/unknown package).
 * LGPL-3.0-or-later (scoped to audited `@img/sharp-*` binary package families) and MPL-2.0 are
 * allowlisted — see `policy.mts` for why. See
 * `static-code-analysis/README.md`'s "Dependency License Policy" section
 * for the full rationale and rollout note.
 */
export async function checkDependencyLicensePolicy(
  ctx: SharedContext,
  dependencies: { collectLicenseReport?: (repoRoot: string) => LicenseReport } = {},
): Promise<{ errors: string[] }> {
  if (!ctx.isInsideGitRepo) {
    return { errors: [`::error::${ctx.repoRoot} is not inside a git repository`] }
  }

  const collect = dependencies.collectLicenseReport ?? collectLicenseReport
  let report: LicenseReport
  try {
    report = collect(ctx.repoRoot)
  } catch (error) {
    return {
      errors: [
        `::error::dependency-license-policy: failed to collect the pnpm license report: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    }
  }

  const errors: string[] = []
  for (const [licenseExpression, entries] of Object.entries(report)) {
    for (const entry of entries) {
      const evaluation = evaluatePackageLicenseExpression(licenseExpression, entry.name)
      if (evaluation.ok) continue
      const versions = entry.versions?.length ? entry.versions.join(', ') : 'unknown version'
      errors.push(
        `::error::dependency-license-policy: ${entry.name}@${versions} is licensed under ` +
          `"${licenseExpression}" (denied: ${evaluation.deniedAtoms.join(', ')}). GPL/AGPL/EPL/` +
          `CDDL/SSPL/BUSL, unlicensed/unknown packages, and unrecognized/custom license ` +
          `identifiers are denied by default; if this is a ` +
          `legitimate false positive, add a narrowly-scoped, justified allowlist entry in ` +
          `static-code-analysis/dependency-license-policy/policy.mts.`,
      )
    }
  }

  return { errors }
}
