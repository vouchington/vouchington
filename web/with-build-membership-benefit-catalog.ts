import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants'

/** The standalone server uses the bundled artifact without build-time dependencies. */
export function withBuildMembershipBenefitCatalog(config: NextConfig) {
  return (phase: string): NextConfig => {
    if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
      execFileSync(
        process.execPath,
        [join(import.meta.dirname, 'generate-membership-benefit-catalog.ts')],
        { stdio: 'inherit' },
      )
    }
    return config
  }
}
