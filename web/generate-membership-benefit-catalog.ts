import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { membershipBenefitCatalog } from '@ts-shared/utils/membership-benefit-catalog'

const artifactUrl = new URL(
  'components/memberships/membership-benefit-catalog.generated.json',
  import.meta.url,
)

/** Importing the producer validates every benefit before any output is written. */
function generateMembershipBenefitCatalog(): void {
  const check = process.argv.includes('--check')
  const content = `${JSON.stringify(membershipBenefitCatalog, null, 2)}\n`
  if (check) {
    if (
      JSON.stringify(JSON.parse(readFileSync(artifactUrl, 'utf8'))) !==
      JSON.stringify(membershipBenefitCatalog)
    ) {
      throw new Error(
        'Membership benefit artifact is stale; run node web/generate-membership-benefit-catalog.ts',
      )
    }
    return
  }
  // Type generation also loads Next config. Preserve formatter-owned bytes when
  // the freshly validated catalog has not changed, while replacing stale data.
  if (
    existsSync(artifactUrl) &&
    JSON.stringify(JSON.parse(readFileSync(artifactUrl, 'utf8'))) ===
      JSON.stringify(membershipBenefitCatalog)
  )
    return
  writeFileSync(artifactUrl, content)
}

generateMembershipBenefitCatalog()
