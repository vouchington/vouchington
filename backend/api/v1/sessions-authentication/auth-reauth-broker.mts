import app from '../../app.mts'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { apiRequestContract } from '@vouchington/utils/api-response-contract'
import { getExpectedOrigin } from '@modules/api-utils'
import { assertNotSuspended } from '@services/users/suspension'
import { beginOAuthAuthorization } from '@services/oauth/authorization-broker'
import { assertBrokerOAuthProvider } from '@services/oauth/broker-config'
import { completeBrokerProviderReAuthProof } from '@services/oauth/provider-reauth-broker'

type BeginBody = {
  callback_mode: 'web' | 'native'
  completion_proof_challenge?: string
}
type ProofBody = { flow_id: ApiUuidContract }

app.route('/api/v1/auth/re-auth/providers/:provider/authorizations').post(async ctx => {
  apiRequestContract<'POST:/api/v1/auth/re-auth/providers/:provider/authorizations', BeginBody>(
    'POST:/api/v1/auth/re-auth/providers/:provider/authorizations',
  )
  const user = await requireAuth(
    ctx,
    'POST:/api/v1/auth/re-auth/providers/:provider/authorizations',
  )
  assertNotSuspended(user)
  const provider = assertBrokerOAuthProvider(ctx.params.provider ?? '')
  const body = await parseJsonBody<BeginBody>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/auth/re-auth/providers/:provider/authorizations', {
    path: ctx.params,
    body,
  })
  const session = await ctx.getSessionTokenData()
  ctx.json(
    await beginOAuthAuthorization({
      provider,
      purpose: 're_auth',
      callbackMode: body.callback_mode,
      completionProofChallenge: body.completion_proof_challenge,
      currentUserId: user.id,
      deviceId: session.did,
      sessionId: session.sid,
      expectedOrigin: getExpectedOrigin(ctx.req),
    }),
  )
})

app.route('/api/v1/auth/re-auth/providers/:provider/proofs').post(async ctx => {
  apiRequestContract<'POST:/api/v1/auth/re-auth/providers/:provider/proofs', ProofBody>(
    'POST:/api/v1/auth/re-auth/providers/:provider/proofs',
  )
  const user = await requireAuth(ctx, 'POST:/api/v1/auth/re-auth/providers/:provider/proofs')
  assertNotSuspended(user)
  const provider = assertBrokerOAuthProvider(ctx.params.provider ?? '')
  const body = await parseJsonBody<ProofBody>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/auth/re-auth/providers/:provider/proofs', {
    path: ctx.params,
    body,
  })
  const session = await ctx.getSessionTokenData()
  const token = await completeBrokerProviderReAuthProof(user.id, {
    provider,
    flowId: body.flow_id,
    deviceId: session.did,
    sessionId: session.sid,
  })
  ctx.json({ re_auth_token: token })
})
