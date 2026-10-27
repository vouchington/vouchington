import app from '../../app.mts'
import { requireAuth, parseJsonBody, validateRequestContract } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { apiRequestContract } from '@vouchington/utils/api-response-contract'
import { getExpectedOrigin } from '@modules/api-utils'
import { beginPasskeyReAuth, completePasskeyReAuth } from '@services/mfa/passkey-reauth'
import { assertNotSuspended } from '@services/users/suspension'

type BeginBody = { passkey_id: ApiUuidContract }
type VerifyBody = BeginBody & { flow_id: ApiUuidContract; response: Record<string, unknown> }

app.route('/api/v1/auth/re-auth/passkeys/options').post(async ctx => {
  apiRequestContract<'POST:/api/v1/auth/re-auth/passkeys/options', BeginBody>(
    'POST:/api/v1/auth/re-auth/passkeys/options',
  )
  const user = await requireAuth(ctx, 'POST:/api/v1/auth/re-auth/passkeys/options')
  assertNotSuspended(user)
  const body = await parseJsonBody<BeginBody>(ctx, '100kb')
  validateRequestContract(ctx, 'POST:/api/v1/auth/re-auth/passkeys/options', { body })
  const session = await ctx.getSessionTokenData()
  ctx.json(
    await beginPasskeyReAuth(user.id, {
      deviceId: session.did,
      sessionId: session.sid,
      passkeyId: body.passkey_id,
    }),
  )
})

app.route('/api/v1/auth/re-auth/passkeys/verification').post(async ctx => {
  apiRequestContract<'POST:/api/v1/auth/re-auth/passkeys/verification', VerifyBody>(
    'POST:/api/v1/auth/re-auth/passkeys/verification',
  )
  const user = await requireAuth(ctx, 'POST:/api/v1/auth/re-auth/passkeys/verification')
  assertNotSuspended(user)
  const body = await parseJsonBody<VerifyBody>(ctx, '100kb')
  validateRequestContract(ctx, 'POST:/api/v1/auth/re-auth/passkeys/verification', { body })
  const session = await ctx.getSessionTokenData()
  const token = await completePasskeyReAuth(user.id, {
    deviceId: session.did,
    sessionId: session.sid,
    passkeyId: body.passkey_id,
    flowId: body.flow_id,
    response: body.response,
    expectedOrigin: getExpectedOrigin(ctx.req),
  })
  ctx.json({ re_auth_token: token })
})
