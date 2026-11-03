import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { hashToken } from '@modules/token-secrets'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { receiveOAuthAuthorizationCallback } from '../authorization-callback.mts'

describe('concurrent OAuth authorization callbacks', () => {
  it('returns one persisted completion handoff to both callers', async () => {
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertTestOAuthAuthorization({ state })
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [flowId] })
    })

    const options = {
      provider: 'github' as const,
      state,
      code: `provider-code-${randomUUID()}`,
    }
    const [first, second] = await Promise.all([
      receiveOAuthAuthorizationCallback(options),
      receiveOAuthAuthorizationCallback(options),
    ])

    expect(first).toMatchObject({ flowId, exchangeRequired: true })
    expect(second).toEqual(first)
    const stored = await getTestOAuthAuthorization(flowId)
    expect(stored).toMatchObject({
      status: 'callback_received',
      callback_code_ciphertext: expect.any(String),
      completion_token_hash: hashToken(
        `oauth-authorization-broker:completion:${flowId}`,
        first.completionToken,
      ),
      completion_token_ciphertext: expect.any(String),
    })
    expect(stored?.completion_token_ciphertext).not.toContain(first.completionToken)
    expect(stored?.callback_code_ciphertext).not.toContain(options.code)
  })
})
