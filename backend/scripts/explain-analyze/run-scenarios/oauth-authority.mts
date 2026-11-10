import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  beginValidatedOAuthAuthorizationRequest,
  validateOAuthAuthorizationRequest,
  registerOAuthClient,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  revokeOAuthToken,
  getOAuthResourceUrl,
  getOAuthAuthorizationRequestForUser,
} from '@services/oauth-authorization-server'
import { validateOAuthAccessToken } from '@services/oauth-authorization-server/access-tokens'
import { runNativeOAuthAuthorityScenario } from './oauth-native-authority.mts'
import { write } from '@data-stores/psql'
import {
  seedOAuthAuthorityCorpus,
  cleanupOAuthAuthorityCorpus,
  analyzeOAuthAuthorityCorpus,
  OAUTH_AUTHORITY_NOISE_COUNT,
} from './oauth-authority-corpus.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

import type { OAUTH_AUTHORITY_SCENARIO_IDS } from '../hot-path-lock-scope-ids.mts'

/** Real public flows capture the authority predicates against the shared seeded users/client corpus. */
export async function runOAuthAuthorityScenarios(): Promise<void> {
  const redirectUri = `http://127.0.0.1:48000/${randomUUID()}`
  const client = await registerOAuthClient(
    {
      client_name: 'Explain authority',
      redirect_uris: [redirectUri],
      scope: 'topics:read',
      token_endpoint_auth_method: 'none',
    },
    seedUser.id,
  )
  const ownedClient = await write<{ id: string }>(
    '/* explainOAuthClientIdentity */ SELECT id FROM oauth_clients WHERE client_id = $1',
    [client.client_id],
  )
  const clientId = ownedClient.rows[0]!.id
  let noiseIds: string[] = []
  try {
    noiseIds = await seedOAuthAuthorityCorpus(clientId, seedUser.id)
    await analyzeOAuthAuthorityCorpus()
    const verifier = randomBytes(32).toString('base64url')
    const parameters = {
      clientId: client.client_id,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      codeChallengeMethod: 'S256',
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      userId: seedUser.id,
      redirectUri,
      resource: getOAuthResourceUrl('user'),
      responseType: 'code',
      scope: 'topics:read',
      state: 'explain-authority',
    }
    const validated = await validateOAuthAuthorizationRequest(parameters)
    let requestId = ''
    await capture('oauth-authority-request', async () => {
      requestId = (await beginValidatedOAuthAuthorizationRequest(parameters, validated)).request_id
    })
    const binding = createOAuthBrowserBindingHash(parameters.deviceId, parameters.sessionId)
    let code = ''
    await capture('oauth-authority-consent', async () => {
      assert.ok(await getOAuthAuthorizationRequestForUser(seedUser.id, requestId, binding))
      const decision = await decideOAuthAuthorizationRequest(
        seedUser.id,
        requestId,
        'approve',
        binding,
      )
      code = new URL(decision.redirect_uri).searchParams.get('code')!
      assert.ok(code)
    })
    let accessToken = ''
    let refreshToken = ''
    await analyzeOAuthAuthorityCorpus()
    await capture('oauth-authority-code', async () => {
      const tokens = await exchangeOAuthAuthorizationCode({
        clientId: client.client_id,
        code,
        codeVerifier: verifier,
        redirectUri,
      })
      accessToken = tokens.access_token
      refreshToken = tokens.refresh_token ?? ''
    })
    assert.ok(refreshToken)
    await capture('oauth-authority-refresh', async () => {
      const refreshed = await exchangeOAuthRefreshToken({
        clientId: client.client_id,
        refreshToken,
      })
      accessToken = refreshed.access_token
    })
    await capture('oauth-authority-access', async () => {
      assert.ok(await validateOAuthAccessToken(accessToken, 'user'))
    })
    await capture('oauth-authority-revoke', async () => {
      await revokeOAuthToken({ clientId: client.client_id, token: refreshToken })
      assert.equal(await validateOAuthAccessToken(accessToken, 'user'), null)
    })
    await runNativeOAuthAuthorityScenario(capture)
  } finally {
    await cleanupOAuthAuthorityCorpus(clientId, noiseIds)
  }
}

const participants = ['readActiveOAuthParticipantUsers', 'authenticateOAuthTokenClient']
const changedQueryNames: Record<(typeof OAUTH_AUTHORITY_SCENARIO_IDS)[number], readonly string[]> =
  {
    'oauth-authority-request': [
      'readActiveOAuthParticipantUsers',
      'getOAuthClient',
      'beginOAuthAuthorizationRequest insert',
    ],
    'oauth-authority-consent': [
      'readActiveOAuthParticipantUsers',
      'getOAuthAuthorizationRequestForUser',
      'lockAuthorizationRequest',
      'upsertGrant',
    ],
    'oauth-authority-code': [
      ...participants,
      'exchangeOAuthAuthorizationCode participants',
      'lockAuthorizationCode',
    ],
    'oauth-authority-refresh': [
      ...participants,
      'exchangeOAuthRefreshToken participants',
      'lockRefreshToken',
      'exchangeOAuthRefreshToken grant',
    ],
    'oauth-authority-access': [
      'readActiveOAuthParticipantUsers',
      'validateOAuthAccessToken participants',
      'validateOAuthAccessToken',
    ],
    'oauth-authority-revoke': [
      ...participants,
      'revokeOAuthToken participants',
      'revokeOAuthToken active participants',
      'revokeOAuthToken refresh',
    ],
    'oauth-authority-native': [
      'readActiveOAuthParticipantUsers',
      'mintNativeSessionMcpToken session',
      'mintNativeSessionMcpToken client',
      'mintNativeSessionMcpToken grant',
    ],
  }

async function capture(
  id: (typeof OAUTH_AUTHORITY_SCENARIO_IDS)[number],
  run: () => Promise<unknown>,
) {
  registerScenarioContract(id, {
    allowEmptyResult: true,
    seededRows: {
      oauth_grants: OAUTH_AUTHORITY_NOISE_COUNT,
      oauth_refresh_tokens: OAUTH_AUTHORITY_NOISE_COUNT,
      oauth_refresh_token_families: OAUTH_AUTHORITY_NOISE_COUNT,
      oauth_access_tokens: OAUTH_AUTHORITY_NOISE_COUNT,
    },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 4 },
      { kind: 'maxProcessedRows', relation: 'oauth_clients', max: 4 },
      { kind: 'maxProcessedRows', relation: 'oauth_authorization_requests', max: 8 },
      { kind: 'maxProcessedRows', relation: 'oauth_authorization_codes', max: 4 },
      { kind: 'maxProcessedRows', relation: 'oauth_grants', max: 4 },
      { kind: 'maxProcessedRows', relation: 'oauth_refresh_tokens', max: 4 },
      { kind: 'maxProcessedRows', relation: 'oauth_refresh_token_families', max: 4 },
      { kind: 'maxProcessedRows', relation: 'oauth_access_tokens', max: 4 },
      { kind: 'maxProcessedRows', relation: 'user_suspensions', max: 4 },
      { kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 },
      { kind: 'maxProcessedRows', relation: 'app_attestation_keys', max: 2 },
    ],
  })
  await runAndCapture(id, run, undefined, changedQueryNames[id], { useWallClock: true })
}
