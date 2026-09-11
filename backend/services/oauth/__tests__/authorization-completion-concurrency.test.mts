import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getActiveTestUserSessions } from '@voucha/test-helpers'
import { getTestOAuthAuthorization } from '@voucha/test-helpers/entities/oauth-authorizations'
import { completeOAuthAuthorization } from '../authorization-completion.mts'
import {
  createOAuthAccount,
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '../test-helpers/authorization-completion.mts'

describe('OAuth authorization completion concurrency', () => {
  it('converges concurrent unauthenticated completion onto one durable session', async () => {
    const cleanup = registerCleanup()
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const completionToken = randomBytes(32).toString('base64url')
    const account = await createOAuthAccount('github', cleanup)
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'github',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'authenticate',
        callbackMode: 'web',
      },
      cleanup,
    )
    const completionOptions = {
      flowId,
      completionToken,
      completionTokenSource: 'cookie' as const,
      deviceId,
      sessionId,
    }

    const settledCompletions = await Promise.allSettled([
      completeOAuthAuthorization(completionOptions),
      completeOAuthAuthorization(completionOptions),
    ])
    const durableRow = await getTestOAuthAuthorization(flowId)
    if (durableRow?.result_user_id) cleanup.userIds.push(durableRow.result_user_id)
    const completions = settledCompletions.map(result => {
      if (result.status === 'rejected') throw result.reason
      return result.value
    })
    expect(completions).toMatchObject([{ status: 'authenticated' }, { status: 'authenticated' }])
    const authenticated = completions.filter(result => result.status === 'authenticated')
    expect(authenticated).toHaveLength(2)
    const [first, second] = authenticated
    if (!first || !second) throw new Error('Expected two authenticated completions')
    expect(second.user.id).toBe(first.user.id)
    expect(second.deviceToken.payload.did).toBe(first.deviceToken.payload.did)
    expect(second.sessionToken.payload.sid).toBe(first.sessionToken.payload.sid)
    expect(await getActiveTestUserSessions(first.user.id)).toMatchObject([
      { id: first.sessionToken.payload.sid },
    ])
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'completed',
      result_kind: 'authenticated',
      result_user_id: first.user.id,
      result_device_id: first.deviceToken.payload.did,
      result_session_id: first.sessionToken.payload.sid,
    })
  })
})
