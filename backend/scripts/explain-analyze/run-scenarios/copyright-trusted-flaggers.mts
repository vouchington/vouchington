import assert from 'node:assert/strict'
import { listCopyrightTrustedFlaggers } from '@services/copyright-notices/trusted-flaggers'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedCopyrightTrustedFlaggers } from '../seed-data/copyright-trusted-flaggers.mts'

const pageSize = 100
const operation = 'flaggerRowsSql'

export async function runCopyrightTrustedFlaggerCapacityScenarios(): Promise<void> {
  const fixture = await seedCopyrightTrustedFlaggers(seedUser.id)
  try {
    const moderator = { ...seedUser, roles: ['moderator'] }
    const cursor: { afterId?: string } = {}
    for (const [index, suffix] of ['first', 'continuation'].entries()) {
      const scenario = `copyright-trusted-flaggers-${suffix}`
      registerScenarioContract(scenario, {
        seededRows: fixture.seededRows,
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          { kind: 'usesIndexes', indexes: ['copyright_trusted_flaggers_pkey'], noSort: true },
          { kind: 'maxProcessedRows', relation: 'copyright_trusted_flaggers', max: 101 },
          { kind: 'maxProcessedRows', relation: 'copyright_trusted_flagger_changes', max: 510 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          const page = await listCopyrightTrustedFlaggers(moderator, {
            limit: pageSize,
            afterId: cursor.afterId,
          })
          assert.deepEqual(page, {
            results: fixture.expected.slice(index * pageSize, (index + 1) * pageSize),
            hasNextPage: true,
          })
          cursor.afterId = page.results.at(-1)!.id
        },
        suffix,
        operation,
        { exactCapturedNames: [operation] },
      )
    }
  } finally {
    await fixture.cleanup()
  }
}
