import assert from 'node:assert/strict'
import { v7 as uuidv7 } from 'uuid'
import { write } from '@data-stores/psql'
import { mintNativeSessionMcpToken } from '@services/oauth-authorization-server/native-session-tokens'
import { seedUser } from '../run-support.mts'

/** A synthetic native session avoids changing the shared user's admission/eviction state. */
export async function runNativeOAuthAuthorityScenario(
  capture: (id: 'oauth-authority-native', run: () => Promise<unknown>) => Promise<void>,
): Promise<void> {
  const sid = uuidv7()
  const did = uuidv7()
  const result = await write(
    `/* seedExplainNativeOAuthSession */ INSERT INTO user_sessions
       (id, user_id, device_id, authentication_origin, user_agent_string_id, expires_at)
     SELECT $1::uuid, $2::uuid, $3::uuid, 'native', id, CURRENT_TIMESTAMP + INTERVAL '1 day'
     FROM user_agent_strings ORDER BY id LIMIT 1`,
    [sid, seedUser.id, did],
  )
  assert.equal(result.rowCount, 1)
  try {
    await capture('oauth-authority-native', async () => {
      const token = await mintNativeSessionMcpToken(seedUser.id, {
        did,
        sid,
        clientApp: 'ios',
        attestationStatus: 'unattested',
      })
      assert.ok(token.access_token)
    })
  } finally {
    await write(
      '/* cleanupExplainNativeOAuthSession */ DELETE FROM user_sessions WHERE id = $1::uuid',
      [sid],
    )
  }
}
