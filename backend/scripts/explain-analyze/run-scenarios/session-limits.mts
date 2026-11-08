import { beginTransaction } from '@data-stores/psql'
import { registerAuthenticatedSession } from '@services/jwt-session/user-sessions'
import { listActiveUserSessions } from '@services/jwt-session/list-active-user-sessions'
import {
  revokeAllAuthenticatedSessionsInTransaction,
  revokeOtherAuthenticatedSessions,
} from '@services/jwt-session/user-session-revocation'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runBlueskyFolloweeReceiptScenarios } from './bluesky-followee-receipts.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { SESSION_LIMIT_ACTIVE_COUNT, SESSION_LIMIT_USER_ID } from '../seed-data/session-limits.mts'

export async function runSessionLimitScenarios(): Promise<void> {
  const scenarios = [
    { name: 'hasAuthenticatedSession', max: 1, existing: true },
    { name: 'hasAuthenticatedSession', max: 1, existing: false },
    {
      name: 'findActiveSessionsForLimit',
      max: SESSION_LIMIT_ACTIVE_COUNT + 1,
    },
    { name: 'revokeOldestAuthenticatedSessions', max: 2 * (SESSION_LIMIT_ACTIVE_COUNT + 1) },
  ] as const
  for (const scenario of scenarios) {
    const { name, max } = scenario
    const missingProbe = 'existing' in scenario && !scenario.existing
    const label = `session-limit-${name}${missingProbe ? '-missing' : ''}`
    registerScenarioContract(label, {
      allowEmptyResult: missingProbe,
      expectations: [{ kind: 'maxProcessedRows', relation: 'user_sessions', max }],
    })
    // no-mistakes-disable-next-line query-reached-per-item: the fixed scenario list captures independent query plans against the same bounded fixture
    await runAndCapture(
      label,
      async () => {
        await using transaction = await beginTransaction()
        await registerAuthenticatedSession(
          {
            sid: seedUuid('existing' in scenario && scenario.existing ? 0 : 200_000, 'fd'),
            uid: SESSION_LIMIT_USER_ID,
            did: seedUuid('existing' in scenario && scenario.existing ? 0 : 200_001, 'fd'),
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
          },
          { query: transaction },
        )
        await transaction.rollback()
      },
      undefined,
      name,
    )
  }

  registerScenarioContract('session-limit-revoke-all', {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'user_sessions',
        max: 3 * SESSION_LIMIT_ACTIVE_COUNT,
      },
    ],
  })
  await runAndCapture(
    'session-limit-revoke-all',
    async () => {
      await using transaction = await beginTransaction()
      await revokeAllAuthenticatedSessionsInTransaction(SESSION_LIMIT_USER_ID, transaction)
      await transaction.rollback()
    },
    undefined,
    'revokeAllAuthenticatedSessions',
  )

  registerScenarioContract('session-limit-revoke-other', {
    // UPDATE without RETURNING reports zero rows at its root even when it changes rows.
    allowEmptyResult: true,
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'user_sessions',
        max: 2 * SESSION_LIMIT_ACTIVE_COUNT,
      },
    ],
  })
  await runAndCapture(
    'session-limit-revoke-other',
    async () => {
      await using transaction = await beginTransaction()
      await revokeOtherAuthenticatedSessions(SESSION_LIMIT_USER_ID, seedUuid(0, 'fd'), {
        query: transaction,
      })
      await transaction.rollback()
    },
    undefined,
    'revokeOtherAuthenticatedSessions',
  )

  registerScenarioContract('session-limit-list-active', {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'user_sessions',
        max: SESSION_LIMIT_ACTIVE_COUNT,
      },
    ],
  })
  await runAndCapture(
    'session-limit-list-active',
    () => listActiveUserSessions(SESSION_LIMIT_USER_ID, seedUuid(0, 'fd')),
    undefined,
    'listActiveUserSessions',
  )

  registerScenarioContract('session-limit-list-active-cursor', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_sessions', max: SESSION_LIMIT_ACTIVE_COUNT },
    ],
  })
  await runAndCapture(
    'session-limit-list-active-cursor',
    () =>
      listActiveUserSessions(SESSION_LIMIT_USER_ID, seedUuid(0, 'fd'), {
        after: { timestamp: '2100-01-01T00:00:00.000Z', id: seedUuid(0, 'fd') },
      }),
    undefined,
    'listActiveUserSessions',
  )
  // Kept in this runner because run.mts is at its 200-line cap; it ran right after this step.
  await runBlueskyFolloweeReceiptScenarios()
}
