import type { Context } from '@jongleberry/api-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { markAuthenticatedOriginRequest } from '@modules/request-client-info/authenticated-origin'
import { markVerifiedSessionCredential } from '@modules/request-client-info/session-credential'
import { runWithSessionRequestContext } from '@modules/request-client-info'
import { BOT_CHALLENGE_ACTION_TAG, BOT_CHALLENGE_REQUIRED } from '@ts-shared/utils/bot-challenge'
import app from './app.mts'
import { enforceLowScoreBotChallenge } from './bot-challenge.mts'

app.route('/bot-challenge-test').post(async (ctx: Context) => {
  markAuthenticatedOriginRequest(ctx.req)
  markVerifiedSessionCredential(ctx.req)
  await runWithSessionRequestContext(null, () => enforceLowScoreBotChallenge(ctx))
})

describe('bot challenge error response', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the factual code and canonical operation action', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const response = await request(app.callback())
      .post('/bot-challenge-test')
      .set('x-voucha-bot-score', '7')

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      message: 'Bot challenge required',
      code: BOT_CHALLENGE_REQUIRED,
      action: BOT_CHALLENGE_ACTION_TAG,
    })
  })
})
