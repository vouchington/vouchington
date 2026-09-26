import {
  collectPnpmLicenseReport,
  evaluatePnpmLicenseReport,
  type PnpmLicenseReport,
} from 'vouchington-tooling/dependency-license-policy'
import type { SharedContext } from 'vouchington-tooling/shared-context'

import { dependencyLicensePolicy } from './policy.mts'

export async function checkDependencyLicensePolicy(
  ctx: SharedContext,
  dependencies: {
    collectPnpmLicenseReport?: (repoRoot: string) => PnpmLicenseReport | Promise<PnpmLicenseReport>
  } = {},
): Promise<{ errors: string[] }> {
  if (!ctx.isInsideGitRepo) {
    return { errors: [`::error::${ctx.repoRoot} is not inside a git repository`] }
  }

  const collect = dependencies.collectPnpmLicenseReport ?? collectPnpmLicenseReport
  let report: PnpmLicenseReport
  try {
    report = await collect(ctx.repoRoot)
  } catch (error) {
    return {
      errors: [
        `::error::dependency-license-policy: failed to collect the pnpm license report: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    }
  }

  const errors = evaluatePnpmLicenseReport(report, dependencyLicensePolicy).map(violation => {
    const versions = violation.versions?.length ? violation.versions.join(', ') : 'unknown version'
    return (
      `::error::dependency-license-policy: ${violation.packageName}@${versions} is licensed under ` +
      `"${violation.licenseExpression}" (denied: ${violation.deniedAtoms.join(', ')}). GPL/AGPL/EPL/` +
      `CDDL/SSPL/BUSL, unlicensed/unknown packages, and unrecognized/custom license ` +
      `identifiers are denied by default; if this is a legitimate false positive, add a narrowly-` +
      `scoped, justified allowlist entry in static-code-analysis/dependency-license-policy/policy.mts.`
    )
  })

  return { errors }
}
