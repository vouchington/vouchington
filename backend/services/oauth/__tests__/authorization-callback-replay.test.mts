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

    const first = await receiveCallback({ provider: 'google', state, code })
    const replay = await receiveCallback({ provider: 'google', state, code })
    expect(replay).toEqual(first)

    await expect(
      receiveCallback({ provider: 'google', state, code: `forged-code-${randomUUID()}` }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('rejects callbacks that carry both a code and an error', async () => {
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertTestOAuthAuthorization({ provider: 'google', state })
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: [flowId] }))
    const code = `google-code-${randomUUID()}`

    await expect(
      receiveCallback({ provider: 'google', state, code, error: 'access_denied' }),
    ).rejects.toMatchObject({ status: 400 })
    await receiveCallback({ provider: 'google', state, code })
    await expect(
      receiveCallback({ provider: 'google', state, code, error: 'forged' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('requires the original error even when another error normalizes to the same value', async () => {
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertTestOAuthAuthorization({ provider: 'google', state })
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: [flowId] }))

    const first = await receiveCallback({ provider: 'google', state, error: 'access_denied' })
    const replay = await receiveCallback({ provider: 'google', state, error: 'access_denied' })
    expect(replay).toEqual(first)

    await expect(
      receiveCallback({ provider: 'google', state, error: 'access denied' }),
    ).rejects.toMatchObject({ status: 409 })
  })
})
