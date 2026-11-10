import assert from 'node:assert/strict'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import {
  lockBlueskyInitiatingSession,
  lockCurrentBlueskyInitiatingSession,
} from '@services/bluesky-accounts/initiating-session'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

export async function runBlueskyAuthoritySnapshotScenario(): Promise<void> {
  const sid = v7()
  const did = v7()
  const authorizationId = v7()
  await write(
    `/* seedBlueskyAuthoritySession */ INSERT INTO user_sessions
    (id, user_id, device_id, authentication_origin, user_agent_string_id, expires_at,
      device_token_digest, device_token_encrypted, device_token_issued_at, device_token_binding)
    SELECT $1::uuid, $2::uuid, $3::uuid, 'native', id, CURRENT_TIMESTAMP + INTERVAL '1 day',
      repeat('a', 64), 'synthetic-ciphertext', CURRENT_TIMESTAMP, '{"client":"native"}'::jsonb
    FROM user_agent_strings ORDER BY id LIMIT 1`,
    [sid, seedUser.id, did],
  )
  try {
    await write(
      `/* seedBlueskyAuthorityAuthorization */ INSERT INTO bluesky_link_authorizations
      (id, user_id, initiating_session_id, handle, callback_mode, expires_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'explain.example', 'web', CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      [authorizationId, seedUser.id, sid],
    )
    registerScenarioContract('bluesky-initiating-authority-snapshot', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'users', max: 2 },
        { kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 },
        { kind: 'maxProcessedRows', relation: 'bluesky_link_authorizations', max: 2 },
        { kind: 'maxProcessedRows', relation: 'user_suspensions', max: 2 },
      ],
    })
    await runAndCapture(
      'bluesky-initiating-authority-snapshot',
      async () => {
        await using query = await beginTransaction()
        assert.equal(await lockBlueskyInitiatingSession(seedUser.id, authorizationId, query), sid)
        assert.equal(
          await lockCurrentBlueskyInitiatingSession(
            seedUser.id,
            { sid, did },
            authorizationId,
            query,
          ),
          sid,
        )
        await query.rollback()
      },
      undefined,
      ['lockBlueskyInitiatingSession', 'readSessionDeviceAuthority'],
    )
    registerScenarioContract('bluesky-missing-session-actor-snapshot', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'users', max: 2 },
        { kind: 'maxProcessedRows', relation: 'user_suspensions', max: 2 },
      ],
    })
    await runAndCapture(
      'bluesky-missing-session-actor-snapshot',
      async () => {
        await using query = await beginTransaction()
        await assert.rejects(
          lockCurrentBlueskyInitiatingSession(
            seedUser.id,
            { sid: v7(), did },
            authorizationId,
            query,
          ),
          { status: 401 },
        )
        await query.rollback()
      },
      undefined,
      'readBlueskyMissingSessionUser',
    )
  } finally {
    await write(
      '/* cleanupBlueskyAuthorityAuthorization */ DELETE FROM bluesky_link_authorizations WHERE id = $1',
      [authorizationId],
    )
    await write('/* cleanupBlueskyAuthoritySession */ DELETE FROM user_sessions WHERE id = $1', [
      sid,
    ])
  }
}
