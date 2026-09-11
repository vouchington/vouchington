/**
 * Seed script for Swift integration tests.
 *
 * Prerequisites:
 *   ./dev/initialize web && source .env
 *
 * Usage:
 *   node backend/scripts/tests/seed-swift-integration.mts
 *
 * The script prints shell export statements for the session cookies needed by
 * VouchaIntegrationTests.  Source the output in your shell before running tests:
 *
 *   eval "$(node backend/scripts/tests/seed-swift-integration.mts)"
 *   export VOUCHA_RUN_INTEGRATION=1
 * From vouchington-clients, run `swift test --package-path swift-clients/core --filter VouchaIntegrationTests`
 * from a vouchington/vouchington-clients checkout after sourcing the output and
 * completing its Filaments contract preflight.
 */
import { upsertSystemUser } from '@services/users/system-users'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { v7 } from 'uuid'

async function main() {
  const user = await upsertSystemUser('swift-integration-test')
  const did = v7()
  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
    did,
    uid: user.id,
  })
  // Print shell export lines — caller sources them via eval "$(node ...)"
  process.stdout.write(`export VOUCHA_TEST_DT=${deviceToken.token}\n`)
  process.stdout.write(`export VOUCHA_TEST_ST=${sessionToken.token}\n`)
}

main().catch(error => {
  console.error('seed-swift-integration failed:', error)
  process.exit(1)
})
