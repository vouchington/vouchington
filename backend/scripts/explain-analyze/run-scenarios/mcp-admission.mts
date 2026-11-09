import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getMcpAdmissionUser } from '@services/mcp-tools'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

/** Two keyed actor projections; execution independently authorizes a fresh primary actor. */
export async function runMcpAdmissionScenario(): Promise<void> {
  const { rows: suspensions } = await write<{ id: string }>(
    `/* seedMcpAdmissionSuspensions */
     INSERT INTO user_suspensions (user_id, reason)
     SELECT $1::uuid, 'EXPLAIN admission fixture'
     FROM generate_series(1, 1000)
     RETURNING id`,
    [seedUser.id],
  )
  assert.equal(suspensions.length, 1000)
  try {
    await write('/* analyzeMcpAdmissionSuspensions */ ANALYZE user_suspensions')
    registerScenarioContract('mcp-admission-user', {
      seededRows: { user_suspensions: 1000 },
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['users_pkey', 'idx_user_suspensions__user'],
          noSort: true,
        },
        { kind: 'maxProcessedRows', relation: 'users', max: 2 },
        { kind: 'maxProcessedRows', relation: 'user_suspensions', max: 1 },
      ],
      forbidSequentialScans: ['users', 'user_suspensions'],
    })
    await runAndCapture(
      'mcp-admission-user',
      async () => {
        const actor = await getMcpAdmissionUser(seedUser.id)
        assert.equal(actor?.id, seedUser.id)
        assert.equal(actor.is_suspended, true)
      },
      undefined,
      'getMcpAdmissionUser',
    )
  } finally {
    await write(
      '/* cleanupMcpAdmissionSuspensions */ DELETE FROM user_suspensions WHERE id = ANY($1::uuid[])',
      [suspensions.map(row => row.id)],
    )
    await write('/* analyzeMcpAdmissionSuspensionCleanup */ VACUUM (ANALYZE) user_suspensions')
  }
}
