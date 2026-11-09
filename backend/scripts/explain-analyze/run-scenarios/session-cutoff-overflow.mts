import assert from 'node:assert/strict'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { revokeSessionsAboveLimit } from '@services/jwt-session/active-session-limit'
import { listActiveUserSessions } from '@services/jwt-session/list-active-user-sessions'
import { sessionLimitsMaxValues } from '@services/jwt-session/session-limits-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

/** More invalid rows than the hard page limit must not expand either read. */
export async function runSessionCutoffOverflowScenarios(): Promise<void> {
  const userId = seedUuid(19_996, '01')
  const cap = sessionLimitsMaxValues.active_sessions_per_user
  const ids = Array.from({ length: cap + 100 }, () => v7())
  const validId = v7()
  const agent = await upsertUserAgentString('Explain cutoff overflow')
  const prior = await write<{ present: boolean }>(
    '/* checkSessionCutoffOverflow */ SELECT EXISTS (SELECT 1 FROM user_session_revocation_cutoffs WHERE user_id = $1) AS present',
    [userId],
  )
  assert.equal(prior.rows[0]?.present, false)
  try {
    await write(
      `/* seedSessionCutoffOverflow */ INSERT INTO user_sessions
      (id, user_id, device_id, authentication_origin, user_agent_string_id, expires_at, authenticated_at)
      SELECT id, $1::uuid, id, 'native', $2::uuid, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '2 days'
      FROM unnest($3::uuid[]) AS input(id)`,
      [userId, agent, ids],
    )
    await write(
      `/* seedSessionCutoffOverflowValid */ INSERT INTO user_sessions
       (id, user_id, device_id, authentication_origin, user_agent_string_id, expires_at, last_seen_at)
       VALUES ($1, $2, $1, 'native', $3, CURRENT_TIMESTAMP + INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '3 days')`,
      [validId, userId, agent],
    )
    await write(
      `/* seedSessionCutoffOverflowBoundary */ INSERT INTO user_session_revocation_cutoffs (user_id, cutoff_at)
      VALUES ($1, CURRENT_TIMESTAMP - INTERVAL '1 day')`,
      [userId],
    )
    await write('/* analyzeSessionCutoffOverflow */ ANALYZE user_sessions')
    await write(
      '/* analyzeSessionCutoffOverflowBoundary */ ANALYZE user_session_revocation_cutoffs',
    )
    const expectations = [
      { kind: 'maxProcessedRows' as const, relation: 'user_sessions', max: cap + 2 },
      {
        kind: 'maxProcessedRows' as const,
        relation: 'user_session_revocation_cutoffs',
        max: cap + 2,
      },
    ]
    registerScenarioContract('session-cutoff-overflow-list', {
      seededRows: { user_session_revocation_cutoffs: 4_000 },
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      allowEmptyResult: true,
      expectations,
    })
    await runAndCapture(
      'session-cutoff-overflow-list',
      async () => {
        const page = await listActiveUserSessions(userId, v7())
        assert.equal(page.results.length, 0)
        assert.equal(page.hasNextPage, true)
        assert.ok(page.continuation)
        const next = await listActiveUserSessions(userId, validId, { after: page.continuation })
        assert.equal(
          next.results.some(row => row.id === validId),
          true,
        )
      },
      undefined,
      'listActiveUserSessions',
    )
    registerScenarioContract('session-cutoff-overflow-admission', {
      seededRows: { user_session_revocation_cutoffs: 4_000 },
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      expectations,
    })
    await runAndCapture(
      'session-cutoff-overflow-admission',
      async () => {
        await using query = await beginTransaction()
        await revokeSessionsAboveLimit(query, userId, v7())
        const remaining = await query<{ count: number }>(
          '/* countCutoffOverflowAfterAdmission */ SELECT count(*)::int AS count FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL',
          [userId],
        )
        assert.equal(remaining.rows[0]?.count, ids.length - cap - 1)
        await query.rollback()
      },
      undefined,
      'findActiveSessionsForLimit',
    )
    registerScenarioContract('session-cutoff-overflow-retire', {
      seededRows: { user_session_revocation_cutoffs: 4_000 },
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      expectations: [{ kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 * (cap + 2) }],
    })
    await runAndCapture(
      'session-cutoff-overflow-retire',
      async () => {
        await using query = await beginTransaction()
        await revokeSessionsAboveLimit(query, userId, v7())
        const remaining = await query<{ count: number }>(
          '/* countCutoffOverflowAfterRetire */ SELECT count(*)::int AS count FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL',
          [userId],
        )
        assert.equal(remaining.rows[0]?.count, ids.length - cap - 1)
        await query.rollback()
      },
      undefined,
      'revokeOldestAuthenticatedSessions',
    )
  } finally {
    await write(
      '/* cleanupSessionCutoffOverflowBoundary */ DELETE FROM user_session_revocation_cutoffs WHERE user_id = $1',
      [userId],
    )
    await write(
      '/* cleanupSessionCutoffOverflow */ DELETE FROM user_sessions WHERE id = ANY($1::uuid[])',
      [[...ids, validId]],
    )
    await write('/* analyzeAfterSessionCutoffOverflow */ ANALYZE user_sessions')
  }
}
