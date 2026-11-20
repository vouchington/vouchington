import { getUsersByReferenceBatch } from '@services/users/resolve-references'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

// One seeded user by id and one by username (mixed case, as MCP callers send it) take both arms
// of the statement; the batch is the shape the MCP entity resolver and copyright audit send.
export async function runUsersByReferenceBatchScenario(): Promise<void> {
  const references = [seedUuid(0, '01'), 'SeedUser1']
  registerScenarioContract('users-by-reference-batch', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['users_pkey'],
        queryContains: 'getUsersByReferenceBatch',
      },
      // Both indexes are on LOWER(username); the planner may pick either for the name arm.
      {
        kind: 'usesIndexes',
        indexes: ['idx_users__username', 'idx_users__username__text_pattern_ops'],
        anyOf: true,
        queryContains: 'getUsersByReferenceBatch',
      },
      { kind: 'noSeqScan', relation: 'users', queryContains: 'getUsersByReferenceBatch' },
      { kind: 'maxProcessedRows', relation: 'users', max: 3 },
    ],
  })
  await runAndCapture(
    'users-by-reference-batch',
    async () => {
      const users = await getUsersByReferenceBatch(references)
      if (users[0]?.username !== 'seeduser0' || users[1]?.username !== 'seeduser1')
        throw new Error('Seeded users must resolve by id and by username')
    },
    undefined,
    'getUsersByReferenceBatch',
  )
}
