import createHttpError from 'http-errors'
import { readGoogleClientId, readGoogleClientSecret } from '@voucha/config'
import { upsertOAuthAccount, type OAuthAccount } from '@services/oauth-accounts'
import { fetch } from 'undici'
import { cancelResponseBody, getExternalRequestDispatcher } from '@modules/utils/http'

/* no-mistakes: integration=oauth */
async function exchangeGoogleAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const clientId = readGoogleClientId()
  const clientSecret = readGoogleClientSecret()
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be defined')
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    dispatcher: getExternalRequestDispatcher(),
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    }).toString(),
    signal,
  })
  if (!response.ok) {
    cancelResponseBody(response)
    throw createHttpError(502, `Google token exchange failed: ${response.status}`)
  }
  return response.json() as Promise<unknown>
}

/* no-mistakes: integration=oauth */
async function fetchGoogleUserInfo(accessToken: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    dispatcher: getExternalRequestDispatcher(),
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })
  if (!response.ok) {
    cancelResponseBody(response)
    throw createHttpError(502, `Google UserInfo request failed: ${response.status}`)
  }
  return response.json() as Promise<unknown>
}

/** Redeems a confidential broker authorization code and identifies the account by Google's stable sub. */
export async function upsertGoogleAuthorizationCodeAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  options: {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  const tokenPayload = await exchangeGoogleAuthorizationCode(
    code,
    redirectUri,
    codeVerifier,
    options.signal,
  )
  const tokenResponse = record(tokenPayload)
  const tokenError = typeof tokenResponse?.error === 'string' ? tokenResponse.error : undefined
  const tokenErrorDescription =
    typeof tokenResponse?.error_description === 'string'
      ? tokenResponse.error_description
      : undefined
  const accessToken = tokenResponse?.access_token
  if (tokenError || typeof accessToken !== 'string' || accessToken.length === 0) {
    throw createHttpError(502, 'Google token exchange failed', {
      cause: new Error(tokenErrorDescription ?? tokenError ?? 'Missing access token'),
    })
  }
  const userInfo = record(await fetchGoogleUserInfo(accessToken, options.signal))
  const subject = userInfo?.sub
  if (!userInfo || typeof subject !== 'string' || subject.length === 0) {
    throw createHttpError(502, 'Google UserInfo response is missing sub')
  }
  options.signal?.throwIfAborted()

  const providerUserData: Record<string, unknown> = {}
  if (typeof userInfo.name === 'string') providerUserData.name = userInfo.name
  if (typeof userInfo.email === 'string') providerUserData.email = userInfo.email
  if (typeof userInfo.picture === 'string') providerUserData.picture = userInfo.picture
  if (typeof userInfo.given_name === 'string') providerUserData.given_name = userInfo.given_name
  if (typeof userInfo.family_name === 'string') providerUserData.family_name = userInfo.family_name

  return upsertOAuthAccount(
    'google',
    subject,
    userInfo.email_verified === true && typeof userInfo.email === 'string' ? userInfo.email : null,
    providerUserData,
    undefined,
    {
      authorizationId: options.authorizationId,
      authorizationClaimId: options.authorizationClaimId,
    },
  )
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
