import type { IncomingMessage } from 'node:http'
import type { Context } from '@jongleberry/api-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getBotChallengeClearanceKey } from '@services/captcha/bot-challenge-clearance'
import { botChallengeConfig } from '@services/captcha/bot-challenge-config'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
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
  const clearanceKeys: string[] = []
  afterEach(async () => {
    vi.unstubAllEnvs()
    deleteDynamicConfigFieldsForTest(botChallengeConfig, ['clearance_seconds'])
    if (clearanceKeys.length > 0) await sessionValkeyClient.unlink(clearanceKeys.splice(0))
  })

  it('requires the canonical challenge for a trusted low-score session mutation', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const sid = crypto.randomUUID()
    const ctx = context({ score: '7', sid })
    clearanceKeys.push(getBotChallengeClearanceKey(sid))

    await expect(asSession(() => enforceLowScoreBotChallenge(ctx))).rejects.toMatchObject({
      status: 403,
      code: BOT_CHALLENGE_REQUIRED,
      action: BOT_CHALLENGE_ACTION_TAG,
    })
    expect(await sessionValkeyClient.ttl(getBotChallengeClearanceKey(sid))).toBe(-2)
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

  it('clears a verified session for the remaining window while retaining request signing', async () => {
    const sid = crypto.randomUUID()
    const first = context({ score: '7', token: 'proof', sid })
    clearanceKeys.push(getBotChallengeClearanceKey(sid))
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'true')
    await asSession(() => enforceLowScoreBotChallenge(first))

    const ttl = await sessionValkeyClient.ttl(getBotChallengeClearanceKey(sid))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(300)

    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const next = context({ score: '7', sid })
    await expect(asSession(() => enforceLowScoreBotChallenge(next))).resolves.toBeUndefined()
    expect(next.verifyAttestedRequestSignature).toHaveBeenCalledTimes(1)

    await expect(
      asSession(() => enforceLowScoreBotChallenge(context({ score: '7', sid, token: '' }))),
    ).rejects.toMatchObject({ code: BOT_CHALLENGE_REQUIRED })
  })

  it('always challenges when the window is zero, including an existing clearance', async () => {
    const sid = crypto.randomUUID()
    clearanceKeys.push(getBotChallengeClearanceKey(sid))
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'true')
    await asSession(() => enforceLowScoreBotChallenge(context({ score: '7', token: 'proof', sid })))
    overrideDynamicConfigFieldsForTest(botChallengeConfig, { clearance_seconds: 0 })
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')

    await expect(
      asSession(() => enforceLowScoreBotChallenge(context({ score: '7', sid }))),
    ).rejects.toMatchObject({ code: BOT_CHALLENGE_REQUIRED })
  })

  it('does not share a clearance with a different session', async () => {
    const firstSid = crypto.randomUUID()
    const otherSid = crypto.randomUUID()
    clearanceKeys.push(getBotChallengeClearanceKey(firstSid), getBotChallengeClearanceKey(otherSid))
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'true')
    await asSession(() =>
      enforceLowScoreBotChallenge(context({ score: '7', token: 'proof', sid: firstSid })),
    )
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')

    await expect(
      asSession(() => enforceLowScoreBotChallenge(context({ score: '7', sid: otherSid }))),
    ).rejects.toMatchObject({ code: BOT_CHALLENGE_REQUIRED })
  })
})

type ContextOptions = {
  authorization?: string
  score?: string
  token?: string
  trusted?: boolean
  verifiedSession?: boolean
  sid?: string
}

function context(options: ContextOptions): Context {
  const did = crypto.randomUUID()
  const sid = options.sid ?? crypto.randomUUID()
  const headers: IncomingMessage['headers'] = {
    ...(options.authorization ? { authorization: options.authorization } : {}),
    ...(options.score ? { 'x-voucha-bot-score': options.score } : {}),
    ...(options.token !== undefined ? { [VOUCHA_BOT_CHALLENGE_TOKEN_HEADER]: options.token } : {}),
  }
  const req = { method: 'POST', headers } as IncomingMessage
  if (options.trusted !== false) markAuthenticatedOriginRequest(req)
  if (options.verifiedSession !== false) markVerifiedSessionCredential(req)

  return {
    req,
    ip: '127.0.0.1',
    hasVerifiedRequestSignature: () => false,
    verifyAttestedRequestSignature: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getDeviceTokenData: async () => ({ did }),
    getSessionTokenData: async () => ({ did, sid, uid: null }),
  } as unknown as Context
}

function asSession<T>(callback: () => T): T {
  return runWithSessionRequestContext(null, callback)
}
