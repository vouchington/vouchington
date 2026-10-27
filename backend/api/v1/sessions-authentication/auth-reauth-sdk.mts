import app from '../../app.mts'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { apiNoRequestBody, apiRequestContract } from '@vouchington/utils/api-response-contract'
import {
  assertSdkReAuthProvider,
  beginSdkProviderReAuth,
  completeSdkProviderReAuth,
} from '@services/oauth/provider-reauth-sdk'
import { assertNotSuspended } from '@services/users/suspension'

type VerifyBody = { flow_id: ApiUuidContract; credential: string }

app.route('/api/v1/auth/re-auth/providers/:provider/challenges').post(async ctx => {
  apiNoRequestBody('POST:/api/v1/auth/re-auth/providers/:provider/challenges')
  const user = await requireAuth(ctx, 'POST:/api/v1/auth/re-auth/providers/:provider/challenges')
  assertNotSuspended(user)
  const provider = assertSdkReAuthProvider(ctx.params.provider)
  validateRequestContract(ctx, 'POST:/api/v1/auth/re-auth/providers/:provider/challenges', {
    path: ctx.params,
  })
  const session = await ctx.getSessionTokenData()
  ctx.json(
    await beginSdkProviderReAuth(user.id, {
      provider,
      deviceId: session.did,
      sessionId: session.sid,
    }),
  )
})

app.route('/api/v1/auth/re-auth/providers/:provider/verification').post(async ctx => {
  apiRequestContract<'POST:/api/v1/auth/re-auth/providers/:provider/verification', VerifyBody>(
    'POST:/api/v1/auth/re-auth/providers/:provider/verification',
  )
  const user = await requireAuth(ctx, 'POST:/api/v1/auth/re-auth/providers/:provider/verification')
  assertNotSuspended(user)
  const provider = assertSdkReAuthProvider(ctx.params.provider)
  const body = await parseJsonBody<VerifyBody>(ctx, '100kb')
  validateRequestContract(ctx, 'POST:/api/v1/auth/re-auth/providers/:provider/verification', {
    path: ctx.params,
    body,
  })
  const session = await ctx.getSessionTokenData()
  const token = await completeSdkProviderReAuth(user.id, {
    provider,
    deviceId: session.did,
    sessionId: session.sid,
    flowId: body.flow_id,
    credential: body.credential,
  })
  ctx.json({ re_auth_token: token })
})
