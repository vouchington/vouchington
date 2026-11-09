import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { beginTransaction } from '@data-stores/psql'
import { registerAuthenticatedSession } from '@services/jwt-session/user-sessions'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { SESSION_LIMIT_USER_ID } from '../seed-data/session-limits.mts'

export async function runSessionAdmissionSnapshotScenario(): Promise<void> {
  registerScenarioContract('session-limit-upsert-snapshot', {
    seededRows: { user_session_revocation_cutoffs: 4_000 },
    forbidSequentialScans: ['user_session_revocation_cutoffs'],
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
      { kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 },
      { kind: 'maxProcessedRows', relation: 'user_session_revocation_cutoffs', max: 2 },
      { kind: 'maxProcessedRows', relation: 'user_agent_strings', max: 1 },
    ],
  })
  // The captured INSERT is replayed after rollback, so its dictionary FK must preexist.
  await upsertUserAgentString('')
  await runAndCapture(
    'session-limit-upsert-snapshot',
    async () => {
      await using transaction = await beginTransaction()
      await registerAuthenticatedSession(
        {
          sid: seedUuid(200_002, 'fd'),
          uid: SESSION_LIMIT_USER_ID,
          did: seedUuid(200_003, 'fd'),
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        },
        { query: transaction },
      )
      await transaction.rollback()
    },
    undefined,
    'upsertAuthenticatedSession',
  )
}
