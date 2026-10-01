import { readFileSync, writeFileSync } from 'node:fs'
import { membershipBenefitCatalog } from '@ts-shared/utils/membership-benefit-catalog'

const artifactUrl = new URL(
  'components/memberships/membership-benefit-catalog.generated.json',
  import.meta.url,
)

/** Importing the producer validates every benefit before any output is written. */
export function generateMembershipBenefitCatalog(output = artifactUrl, check = false): void {
  const content = `${JSON.stringify(membershipBenefitCatalog, null, 2)}\n`
  if (check) {
    if (
      JSON.stringify(JSON.parse(readFileSync(output, 'utf8'))) !==
      JSON.stringify(membershipBenefitCatalog)
    ) {
      throw new Error(
        'Membership benefit artifact is stale; run node web/generate-membership-benefit-catalog.ts',
      )
    }
    return
  }
  writeFileSync(output, content)
}

if (import.meta.main)
  generateMembershipBenefitCatalog(artifactUrl, process.argv.includes('--check'))
