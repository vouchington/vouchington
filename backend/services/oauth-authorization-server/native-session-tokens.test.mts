import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import {
  getTestNativeGrantRetentionCounts,
  getTestNativeGrantRetentionState,
  setTestOAuthGrantEnd,
} from '@voucha/test-helpers/entities/oauth-retention-evidence'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { mintNativeSessionMcpToken } from './native-session-tokens.mts'

describe('native session MCP grants', () => {
  it('retains exactly one grant anchor across distinct mints for one session', async () => {
    const user = await createTestUser()
    const did = uuidv7()
    const tokens = await createDeviceAndSessionTokens({ did, uid: user.id, authOrigin: 'native' })
    const sid = tokens.sessionToken.payload.sid

    const first = await mintNativeSessionMcpToken(user.id, {
      did,
      sid,
      clientApp: 'ios',
      attestationStatus: 'unattested',
    })
    const second = await mintNativeSessionMcpToken(user.id, {
      did,
      sid,
      clientApp: 'ios',
      attestationStatus: 'unattested',
    })

    expect(first.access_token).not.toBe(second.access_token)
    expect(await getTestNativeGrantRetentionCounts(user.id, sid)).toEqual({
      grant_count: 1,
      anchor_count: 1,
      mint_count: 2,
      distinct_mint_grants: 1,
    })

    const grant = await getTestNativeGrantRetentionState(user.id, sid)
    expect(grant.ended_at).toBeNull()
    await setTestOAuthGrantEnd(grant.id, new Date())
    await expect(
      mintNativeSessionMcpToken(user.id, {
        did,
        sid,
        clientApp: 'ios',
        attestationStatus: 'unattested',
      }),
    ).rejects.toThrow('MCP connection was revoked for this session')
    expect((await getTestNativeGrantRetentionState(user.id, sid)).ended_at).toBeInstanceOf(Date)
    expect(await getTestNativeGrantRetentionCounts(user.id, sid)).toEqual({
      grant_count: 1,
      anchor_count: 1,
      mint_count: 2,
      distinct_mint_grants: 1,
    })
  })
})
