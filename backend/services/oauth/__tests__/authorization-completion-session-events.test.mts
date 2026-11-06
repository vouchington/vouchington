import { randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readAuthSessionEventTypes } from '@voucha/test-helpers/auth-session-events'
import { completeOAuthAuthorization } from '../authorization-completion.mts'
import {
  createOAuthAccount,
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '../../../test-helpers/services/oauth/authorization-completion.mts'

describe('OAuth authorization completion session events', () => {
  let testDir: string
  let originalAnalyticsLocalDir: string | undefined
  let originalAnalyticsBackend: string | undefined

  beforeAll(async () => {
    originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
    originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oauth-completion-events-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true })
    if (originalAnalyticsLocalDir === undefined) delete process.env.ANALYTICS_LOCAL_DIR
    else process.env.ANALYTICS_LOCAL_DIR = originalAnalyticsLocalDir
    if (originalAnalyticsBackend === undefined) delete process.env.ANALYTICS_BACKEND
    else process.env.ANALYTICS_BACKEND = originalAnalyticsBackend
  })

  it('records the durable session as created on first issuance and refreshed on replay', async () => {
    const cleanup = registerCleanup()
    const account = await createOAuthAccount('github', cleanup)
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const completionToken = randomBytes(32).toString('base64url')
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
    const options = {
      flowId,
      completionToken,
      completionTokenSource: 'cookie' as const,
      deviceId,
      sessionId,
    }
    const readEventTypes = (sid: string) => readAuthSessionEventTypes(testDir, sid)

    const first = await completeOAuthAuthorization(options)
    if (first.status !== 'authenticated') throw new Error('Expected authentication')
    cleanup.userIds.push(first.user.id)
    const durableSessionId = first.sessionToken.payload.sid
    expect(await readEventTypes(durableSessionId)).toEqual(['created'])

    await completeOAuthAuthorization({
      ...options,
      deviceId: first.deviceToken.payload.did,
      sessionId: durableSessionId,
      currentUserId: first.user.id,
    })
    expect(
      (await readEventTypes(durableSessionId)).toSorted(
        (a, b) => Number(String(a) > String(b)) - Number(String(a) < String(b)),
      ),
    ).toEqual(['created', 'refreshed_authenticated'])
  })
})
