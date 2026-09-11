import createHttpError from 'http-errors'
import { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } from '@voucha/config'
import { upsertOAuthAccount, type OAuthAccount } from '@services/oauth-accounts'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

type LinkedInTokenResponse = {
  access_token: string
  expires_in?: number
  refresh_token?: string
  error?: string
  error_description?: string
}

type LinkedInUserInfo = {
  sub: string
  name?: string
  email?: string
  picture?: string
  given_name?: string
  family_name?: string
  email_verified?: boolean
}

/* no-mistakes: integration=oauth */
async function exchangeLinkedInAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<LinkedInTokenResponse> {
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
    throw new Error('LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be defined')
  }
  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    dispatcher: getExternalRequestDispatcher(),
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
      code_verifier: codeVerifier,
    }).toString(),
  })
  if (!response.ok) {
    throw createHttpError(502, `LinkedIn token exchange failed: ${response.status}`)
  }
  return response.json() as Promise<LinkedInTokenResponse>
}

/* no-mistakes: integration=oauth */
async function fetchLinkedInUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    dispatcher: getExternalRequestDispatcher(),
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw createHttpError(502, `LinkedIn userinfo request failed: ${response.status}`)
  }
  return response.json() as Promise<LinkedInUserInfo>
}

export async function upsertLinkedInAccount(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<OAuthAccount> {
  const tokenResponse = await exchangeLinkedInAuthorizationCode(code, redirectUri, codeVerifier)
  if (tokenResponse.error) {
    throw createHttpError(502, 'OAuth token exchange failed', {
      cause: new Error(tokenResponse.error_description ?? tokenResponse.error),
    })
  }

  const userInfo = await fetchLinkedInUserInfo(tokenResponse.access_token)
  const providerUserData: Record<string, unknown> = {}
  if (userInfo.name) providerUserData.name = userInfo.name
  if (userInfo.email) providerUserData.email = userInfo.email
  if (userInfo.picture) providerUserData.picture = userInfo.picture
  if (userInfo.given_name) providerUserData.given_name = userInfo.given_name
  if (userInfo.family_name) providerUserData.family_name = userInfo.family_name

  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000)
    : undefined

  return upsertOAuthAccount(
    'linkedin',
    userInfo.sub,
    userInfo.email_verified ? (userInfo.email ?? null) : null,
    providerUserData,
    {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      accessTokenExpiresAt: expiresAt,
    },
  )
}
