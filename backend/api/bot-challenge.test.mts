import type { IncomingMessage } from 'node:http'
import type { Context } from '@jongleberry/api-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { markAuthenticatedOriginRequest } from '@modules/request-client-info/authenticated-origin'
import { markVerifiedSessionCredential } from '@modules/request-client-info/session-credential'
import {
  runWithCredentialRequestContext,
  runWithSessionRequestContext,
} from '@modules/request-client-info'
import {
  BOT_CHALLENGE_ACTION_TAG,
  BOT_CHALLENGE_REQUIRED,
  VOUCHA_BOT_CHALLENGE_TOKEN_HEADER,
} from '@ts-shared/utils/bot-challenge'
import { enforceLowScoreBotChallenge } from './bot-challenge.mts'

describe('low-score bot challenge', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires the canonical challenge for a trusted low-score session mutation', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const ctx = context({ score: '7' })

    await expect(asSession(() => enforceLowScoreBotChallenge(ctx))).rejects.toMatchObject({
      status: 403,
      code: BOT_CHALLENGE_REQUIRED,
      action: BOT_CHALLENGE_ACTION_TAG,
    })
  })

  it('does not let a forged Bearer header bypass a cookie-session challenge', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const ctx = context({ score: '7', authorization: 'Bearer forged' })

    await expect(asSession(() => enforceLowScoreBotChallenge(ctx))).rejects.toMatchObject({
      code: BOT_CHALLENGE_REQUIRED,
    })
  })

  it('requires proof for verified cookie authority even without session-origin context', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const ctx = context({ score: '7' })

    await expect(enforceLowScoreBotChallenge(ctx)).rejects.toMatchObject({
      code: BOT_CHALLENGE_REQUIRED,
    })
  })

  it('skips a request without a verified session credential', async () => {
    const ctx = context({ score: '7', verifiedSession: false })

    await expect(asSession(() => enforceLowScoreBotChallenge(ctx))).resolves.toBeUndefined()
    expect(ctx.verifyAttestedRequestSignature).not.toHaveBeenCalled()
  })

  it.each([undefined, '30', '99'])('skips an absent or non-low score %s', async score => {
    const ctx = context({ score })

    await expect(asSession(() => enforceLowScoreBotChallenge(ctx))).resolves.toBeUndefined()
    expect(ctx.verifyAttestedRequestSignature).not.toHaveBeenCalled()
  })

  it('ignores a spoofed low score on an unauthenticated origin transport', async () => {
    const ctx = context({ score: '7', trusted: false })

    await expect(asSession(() => enforceLowScoreBotChallenge(ctx))).resolves.toBeUndefined()
  })

  it.each([
    { interface: 'rest', credential: 'api_key', client: null, oauthClientId: null } as const,
    {
      interface: 'rest',
      credential: 'oauth',
      client: null,
      oauthClientId: 'oauth-client-id',
    } as const,
  ])('skips actual non-cookie credential authority $credential', async origin => {
    const ctx = context({ score: '7', authorization: 'Bearer valid' })

    await expect(
      runWithCredentialRequestContext(origin, () => enforceLowScoreBotChallenge(ctx)),
    ).resolves.toBeUndefined()
  })

  it('accepts the distinct generic proof once per request', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'true')
    const ctx = context({ score: '1', token: 'single-use-proof' })

    await asSession(() => enforceLowScoreBotChallenge(ctx))
    await asSession(() => enforceLowScoreBotChallenge(ctx))

    expect(ctx.verifyAttestedRequestSignature).toHaveBeenCalledTimes(1)
  })
})

type ContextOptions = {
  authorization?: string
  score?: string
  token?: string
  trusted?: boolean
  verifiedSession?: boolean
}

function context(options: ContextOptions): Context {
  const headers: IncomingMessage['headers'] = {
    ...(options.authorization ? { authorization: options.authorization } : {}),
    ...(options.score ? { 'x-voucha-bot-score': options.score } : {}),
    ...(options.token ? { [VOUCHA_BOT_CHALLENGE_TOKEN_HEADER]: options.token } : {}),
  }
  const req = { method: 'POST', headers } as IncomingMessage
  if (options.trusted !== false) markAuthenticatedOriginRequest(req)
  if (options.verifiedSession !== false) markVerifiedSessionCredential(req)

  return {
    req,
    ip: '127.0.0.1',
    hasVerifiedRequestSignature: () => false,
    verifyAttestedRequestSignature: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getDeviceTokenData: async () => ({ did: crypto.randomUUID() }),
  } as unknown as Context
}

function asSession<T>(callback: () => T): T {
  return runWithSessionRequestContext(null, callback)
}
