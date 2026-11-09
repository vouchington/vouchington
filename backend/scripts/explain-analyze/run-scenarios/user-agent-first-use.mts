import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runUserAgentFirstUseScenario(): Promise<void> {
  registerScenarioContract('user-agent-first-use', {
    allowEmptyResult: true, // The first lookup deliberately misses; INSERT must return the new id.
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_agent_strings', max: 5 },
      {
        kind: 'usesIndexes',
        indexes: ['uq_user_agent_strings__user_agent'],
        queryContains: 'SELECT id FROM user_agent_strings',
      },
    ],
  })
  const userAgent = `Explain first-use agent/${randomUUID()}`
  await runAndCapture(
    'user-agent-first-use',
    async () => {
      await using transaction = await beginTransaction()
      const id = await upsertUserAgentString(userAgent, { query: transaction })
      if (!id) throw new Error('First-use user agent must return its inserted id')
      await transaction.rollback()
    },
    undefined,
    'upsertUserAgentString',
  )
}
