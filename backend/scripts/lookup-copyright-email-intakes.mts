import { createInterface } from 'node:readline/promises'
import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { getPrivateUserByAny } from '@services/users/get'
import { lookupRetainedCopyrightEmailIntakes } from '@services/copyright-notices/retained-email-intake-lookup'

// Trusted operator tool: database and decryption access are prerequisites, not granted here.
// The requester address is prompted so it does not enter shell history or the process arguments.
async function main() {
  const [staffUserId, after] = process.argv.slice(2)
  if (!staffUserId || staffUserId === '--help') {
    console.log(
      'Usage: node backend/scripts/lookup-copyright-email-intakes.mts <staff-user-id> [after] (load target environment first)',
    )
    return
  }
  const currentUser = await getPrivateUserByAny(staffUserId, { readOnly: false })
  if (!currentUser) throw new Error('Staff user not found')
  const prompt = createInterface({ input: process.stdin, output: process.stderr })
  let senderAddress: string
  try {
    senderAddress = await prompt.question('Requester sender address: ')
  } finally {
    prompt.close()
  }
  const page = await lookupRetainedCopyrightEmailIntakes(currentUser, {
    senderAddress,
    limit: 100,
    after,
  })
  console.log(JSON.stringify(page, null, 2))
}

try {
  await main()
} catch {
  // Do not log an error object: database/decryption errors can contain personal data or secrets.
  console.error('Retained intake lookup failed; no complete result is available.')
  process.exitCode = 1
} finally {
  try {
    await shutdownDataStoresForOneOffCommand()
  } catch {
    console.error(
      'Retained intake lookup shutdown failed; retry before treating the result as complete.',
    )
    process.exitCode = 1
  }
}
