import {
  assertProviderReAuthNonce,
  type OAuthAccountUpsertOptions,
  type PreparedOAuthAccount,
} from '@services/oauth-accounts/reauthentication'
import { microsoftAuthorizationScopes, microsoftProvider } from '@vouchington/utils/oauth-providers'
import createHttpError from 'http-errors'
import { verifyMicrosoftIdentityToken } from './verified-email.mts'
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID } from '@voucha/config'
import {
  prepareOAuthAccountPersistence,
  prepareRedeemedProviderAccount,
  type OAuthAccount,
} from '@services/oauth-accounts'
import { fetch } from 'undici'
import { getExternalFetch, getExternalRequestDispatcher } from '@modules/utils/http'

type MicrosoftTokenResponse = {
  id_token?: string
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  error?: string
  error_description?: string
}

type MicrosoftUserData = {
  id: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
  givenName?: string
  surname?: string
}

/* no-mistakes: integration=oauth */
async function exchangeMicrosoftAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  signal?: AbortSignal,
): Promise<MicrosoftTokenResponse> {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error('MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be defined')
  }
  const tenantId = MICROSOFT_TENANT_ID || 'common'
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    dispatcher: getExternalRequestDispatcher(),
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      code_verifier: codeVerifier,
      scope: microsoftAuthorizationScopes,
    }).toString(),
    signal,
  })
  if (!response.ok) {
    throw createHttpError(502, `Microsoft token exchange failed: ${response.status}`)
  }
  return response.json() as Promise<MicrosoftTokenResponse>
}

/* no-mistakes: integration=oauth */
async function fetchMicrosoftUser(
  accessToken: string,
  signal?: AbortSignal,
): Promise<MicrosoftUserData> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    dispatcher: getExternalRequestDispatcher(),
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })
  if (!response.ok) {
    throw createHttpError(502, `Microsoft Graph /me request failed: ${response.status}`)
  }
  return response.json() as Promise<MicrosoftUserData>
}

export async function prepareMicrosoftAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  options: OAuthAccountUpsertOptions & { signal?: AbortSignal } = {},
): Promise<PreparedOAuthAccount> {
  if (!options.reAuth) {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET)
      throw new Error('MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be defined')
    return prepareRedeemedProviderAccount(
      microsoftProvider({
        clientId: MICROSOFT_CLIENT_ID,
        clientSecret: MICROSOFT_CLIENT_SECRET,
        tenantId: MICROSOFT_TENANT_ID,
      }),
      { code, redirectUri, codeVerifier },
      { ...options, label: 'Microsoft', fetch: getExternalFetch() },
    )
  }
  const tokenResponse = await exchangeMicrosoftAuthorizationCode(
    code,
    redirectUri,
    codeVerifier,
    options.signal,
  )
  if (tokenResponse.error) {
    throw createHttpError(502, 'OAuth token exchange failed', {
      cause: new Error(tokenResponse.error_description ?? tokenResponse.error),
    })
  }

  const msUser = await fetchMicrosoftUser(tokenResponse.access_token, options.signal)
  const identity = tokenResponse.id_token
    ? await verifyMicrosoftIdentityToken(tokenResponse.id_token, msUser.id, options.signal)
    : undefined
  if (options.reAuth) assertProviderReAuthNonce(options.reAuth, identity?.nonce)
  const email = identity?.email ?? null
  const providerUserData: Record<string, unknown> = {}
  if (msUser.displayName) providerUserData.name = msUser.displayName
  if (email) providerUserData.email = email
  if (msUser.givenName) providerUserData.given_name = msUser.givenName
  if (msUser.surname) providerUserData.family_name = msUser.surname

  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000)
    : undefined

  return prepareOAuthAccountPersistence(
    'microsoft',
    msUser.id,
    email,
    providerUserData,
    {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      accessTokenExpiresAt: expiresAt,
    },
    options,
  )
}

export async function upsertMicrosoftAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  options: OAuthAccountUpsertOptions & { signal?: AbortSignal } = {},
): Promise<OAuthAccount> {
  const prepared = await prepareMicrosoftAccount(code, redirectUri, codeVerifier, options)
  return prepared.persist()
}
