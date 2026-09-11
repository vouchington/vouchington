import createHttpError from 'http-errors'
import { X_CLIENT_ID, X_CLIENT_SECRET } from '@voucha/config'
import { upsertOAuthAccount, type OAuthAccount } from '@services/oauth-accounts'
import {
  createProviderOperationSignal,
  getProviderFetch,
  rethrowProviderTransportError,
} from '@modules/api-egress-proxy'

type XTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  scope: string
  error?: string
  error_description?: string
}

type XUserData = {
  id: string
  name: string
  username: string
  profile_image_url?: string
}

/* no-mistakes: integration=oauth */
async function exchangeXAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  signal?: AbortSignal,
): Promise<XTokenResponse> {
  if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
    throw new Error('X_CLIENT_ID and X_CLIENT_SECRET must be defined')
  }
  const credentials = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')
  const response = await getProviderFetch('x_oauth_enabled')('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
    signal: createProviderOperationSignal(signal),
  })
  if (!response.ok) throw createHttpError(502, `X token exchange failed: ${response.status}`)
  return response.json() as Promise<XTokenResponse>
}

/* no-mistakes: integration=oauth */
async function fetchXUser(accessToken: string, signal?: AbortSignal): Promise<XUserData> {
  const response = await getProviderFetch('x_oauth_enabled')(
    'https://api.x.com/2/users/me?user.fields=profile_image_url',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: createProviderOperationSignal(signal),
    },
  )
  if (!response.ok) throw createHttpError(502, `X /users/me request failed: ${response.status}`)
  const data = (await response.json()) as { data: XUserData }
  return data.data
}

export async function upsertXAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  options: {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  let tokenResponse: XTokenResponse
  try {
    tokenResponse = await exchangeXAuthorizationCode(
      code,
      redirectUri,
      codeVerifier,
      options.signal,
    )
  } catch (error) {
    rethrowProviderTransportError('X', error)
  }
  if (tokenResponse.error) {
    throw createHttpError(502, 'OAuth token exchange failed', {
      cause: new Error(tokenResponse.error_description ?? tokenResponse.error),
    })
  }

  let xUser: XUserData
  try {
    xUser = await fetchXUser(tokenResponse.access_token, options.signal)
  } catch (error) {
    rethrowProviderTransportError('X', error)
  }
  const providerUserData: Record<string, unknown> = {
    name: xUser.name,
    username: xUser.username,
  }
  if (xUser.profile_image_url) providerUserData.profile_image_url = xUser.profile_image_url

  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000)
    : undefined

  return upsertOAuthAccount(
    'x',
    xUser.id,
    null,
    providerUserData,
    {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      accessTokenExpiresAt: expiresAt,
    },
    options,
  )
}
