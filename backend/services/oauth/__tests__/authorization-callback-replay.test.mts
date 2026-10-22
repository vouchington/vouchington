import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { receiveOAuthAuthorizationCallback as receiveCallback } from '../authorization-broker.mts'

describe('OAuth callback replay proof', () => {
  it('returns the same handoff only for the original provider code', async () => {
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertTestOAuthAuthorization({ provider: 'google', state })
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: [flowId] }))
    const code = `google-code-${randomUUID()}`

    const first = await receiveCallback({ provider: 'google', state, code }, () => new Date())
    const replay = await receiveCallback({ provider: 'google', state, code }, () => new Date())
    expect(replay).toEqual(first)

    await expect(
      receiveCallback(
        { provider: 'google', state, code: `forged-code-${randomUUID()}` },
        () => new Date(),
      ),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('requires the original error even when another error normalizes to the same value', async () => {
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertTestOAuthAuthorization({ provider: 'google', state })
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: [flowId] }))

    const first = await receiveCallback(
      { provider: 'google', state, error: 'access_denied' },
      () => new Date(),
    )
    const replay = await receiveCallback(
      { provider: 'google', state, error: 'access_denied' },
      () => new Date(),
    )
    expect(replay).toEqual(first)

    await expect(
      receiveCallback({ provider: 'google', state, error: 'access denied' }, () => new Date()),
    ).rejects.toMatchObject({ status: 409 })
  })
})
