import { runSessionCutoffCleanupScenarios } from './session-cutoff-cleanup.mts'
import assert from 'node:assert/strict'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { readSessionDeviceAuthority } from '@services/jwt-session/device-authority'
import { isSessionRevoked } from '@services/jwt-session/revocation'
import { registerAuthenticatedSession } from '@services/jwt-session/user-sessions'
import { assertFreshReAuth, createReAuthToken } from '@services/mfa/re-auth'
import {
  revokeAuthenticatedSession,
  revokeOtherAuthenticatedSessions,
} from '@services/jwt-session/user-session-revocation'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

/** A retained cutoff and three real session rows exercise each durable authority branch. */
export async function runSessionCutoffAuthorityScenarios(): Promise<void> {
  const userId = seedUuid(19_998, '01')
  const actor = v7()
  const overflow = v7()
  const newer = v7()
  const agent = await upsertUserAgentString('Explain cutoff authority')
  const prior = await write<{ present: boolean }>(
    '/* checkSessionCutoffFixture */ SELECT EXISTS (SELECT 1 FROM user_session_revocation_cutoffs WHERE user_id = $1) AS present',
    [userId],
  )
  assert.equal(prior.rows[0]?.present, false)
  try {
    await write(
      `/* seedSessionCutoffAuthorities */ INSERT INTO user_sessions
        (id, user_id, device_id, authentication_origin, user_agent_string_id, expires_at,
         authenticated_at, device_token_digest, device_token_encrypted, device_token_issued_at, device_token_binding)
       SELECT id, $1::uuid, id, 'native', $2::uuid, CURRENT_TIMESTAMP + INTERVAL '1 day',
         CASE WHEN id = $3::uuid THEN CURRENT_TIMESTAMP ELSE CURRENT_TIMESTAMP - INTERVAL '2 days' END,
         repeat('a', 64), 'synthetic-ciphertext', CURRENT_TIMESTAMP, '{"client":"native"}'::jsonb
       FROM unnest($4::uuid[]) AS input(id)`,
      [userId, agent, newer, [actor, overflow, newer]],
    )
    await write(
      `/* seedSessionCutoffBoundary */ INSERT INTO user_session_revocation_cutoffs
       (user_id, cutoff_at, preserved_session_id) VALUES ($1, CURRENT_TIMESTAMP - INTERVAL '1 day', $2)`,
      [userId, actor],
    )
    for (const [label, sid, revoked] of [
      ['session-cutoff-preserved-authority', actor, false],
      ['session-cutoff-revoked-authority', overflow, true],
      ['session-cutoff-new-authority', newer, false],
    ] as const) {
      registerScenarioContract(label, {
        seededRows: { user_session_revocation_cutoffs: 4_000 },
        forbidSequentialScans: ['user_session_revocation_cutoffs'],
        allowEmptyResult: revoked,
        expectations: [
          { kind: 'maxProcessedRows', relation: 'users', max: 2 },
          { kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 },
          { kind: 'maxProcessedRows', relation: 'user_session_revocation_cutoffs', max: 2 },
        ],
      })
      // no-mistakes-disable-next-line query-reached-per-item: three fixed cutoff branches capture distinct authority plans.
      await runAndCapture(
        label,
        async () => {
          assert.equal(await isSessionRevoked(sid, { userId, deviceId: sid }), revoked)
          assert.equal((await readSessionDeviceAuthority(sid))?.id ?? null, revoked ? null : sid)
        },
        undefined,
        ['isDurablyRevoked', 'readSessionDeviceAuthority'],
      )
    }
    registerScenarioContract('session-cutoff-reauth-create', {
      seededRows: { user_session_revocation_cutoffs: 4_000 },
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 },
        { kind: 'maxProcessedRows', relation: 'user_session_revocation_cutoffs', max: 2 },
      ],
    })
    await runAndCapture(
      'session-cutoff-reauth-create',
      async () => {
        await using query = await beginTransaction()
        assert.ok(await createReAuthToken(userId, { sid: actor, did: actor }, query))
        await query.rollback()
      },
      undefined,
      'createReAuthToken',
    )
    await using setupQuery = await beginTransaction()
    const proof = await createReAuthToken(userId, { sid: actor, did: actor }, setupQuery)
    await setupQuery.commit()
    registerScenarioContract('session-cutoff-reauth-consume', {
      seededRows: { user_session_revocation_cutoffs: 4_000 },
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 },
        { kind: 'maxProcessedRows', relation: 'user_session_revocation_cutoffs', max: 2 },
      ],
    })
    await runAndCapture(
      'session-cutoff-reauth-consume',
      async () => {
        await using query = await beginTransaction()
        await assertFreshReAuth(userId, { sid: actor, did: actor }, proof, query)
        await query.rollback()
      },
      undefined,
      'verifyAndDeleteReAuthToken',
    )
    registerScenarioContract('session-cutoff-write', {
      seededRows: { user_session_revocation_cutoffs: 4_000 },
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      expectations: [
        { kind: 'maxProcessedRows', relation: 'users', max: 2 },
        { kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 },
        { kind: 'maxProcessedRows', relation: 'user_session_revocation_cutoffs', max: 2 },
      ],
    })
    await runAndCapture(
      'session-cutoff-write',
      async () => {
        assert.equal(await revokeAuthenticatedSession(userId, overflow), true)
        await using query = await beginTransaction()
        await revokeOtherAuthenticatedSessions(userId, actor, { query })
        await query.rollback()
      },
      undefined,
      ['recordUserSessionRevocationCutoff', 'revokeAuthenticatedSession'],
      {
        afterCapture: async () => {
          await write(
            '/* restoreSessionCutoffSingleRevocation */ UPDATE user_sessions SET revoked_at = NULL WHERE id = $1 AND user_id = $2',
            [overflow, userId],
          )
        },
      },
    )
    for (const [label, sid] of [
      ['session-cutoff-upsert-preserved', actor],
      ['session-cutoff-upsert-revoked', overflow],
    ] as const) {
      registerScenarioContract(label, {
        seededRows: { user_session_revocation_cutoffs: 4_000 },
        forbidSequentialScans: ['user_session_revocation_cutoffs'],
        allowEmptyResult: sid === overflow,
        expectations: [
          { kind: 'maxProcessedRows', relation: 'users', max: 2 },
          { kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 },
          { kind: 'maxProcessedRows', relation: 'user_session_revocation_cutoffs', max: 2 },
          { kind: 'maxProcessedRows', relation: 'user_agent_strings', max: 2 },
        ],
      })
      // no-mistakes-disable-next-line query-reached-per-item: fixed preserved and revoked conflict branches are both measured.
      await runAndCapture(
        label,
        async () => {
          await using query = await beginTransaction()
          await registerAuthenticatedSession(
            { uid: userId, sid, did: sid, expiresAt: new Date(Date.now() + 86_400_000) },
            { query },
          )
          await query.rollback()
        },
        undefined,
        'upsertAuthenticatedSession',
      )
    }
    await runSessionCutoffCleanupScenarios(userId, newer)
  } finally {
    await write(
      '/* cleanupSessionCutoffBoundary */ DELETE FROM user_session_revocation_cutoffs WHERE user_id = $1',
      [userId],
    )
    await write(
      '/* cleanupSessionCutoffAuthorities */ DELETE FROM user_sessions WHERE id = ANY($1::uuid[])',
      [[actor, overflow, newer]],
    )
  }
}
