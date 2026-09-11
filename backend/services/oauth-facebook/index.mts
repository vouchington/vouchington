import createHttpError from 'http-errors'
import { FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_GRAPHQL_VERSION } from '@voucha/config'
import { upsertOAuthAccount, type OAuthAccount } from '@services/oauth-accounts'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

const fields = ['name', 'email'].join(',')

type FacebookUserData = {
  id: string
  name: string
  email?: string
}

type FacebookResponseErrorObject = {
  message: string
  type?: string
  code?: number
  fbtrace_id?: string
}

type LongLivedAccessToken = {
  access_token: string
  expires_in: number
  error?: FacebookResponseErrorObject
}

type AuthorizationCodeAccessToken = {
  access_token: string
  error?: FacebookResponseErrorObject
}

/* no-mistakes: integration=oauth */
async function exchangeFacebookAuthorizationCode(
  code: string,
  redirectUri: string,
  signal?: AbortSignal,
): Promise<AuthorizationCodeAccessToken> {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    throw new Error('FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be defined')
  }
  const response = await fetch(
    `https://graph.facebook.com/${FACEBOOK_GRAPHQL_VERSION}/oauth/access_token`,
    {
      dispatcher: getExternalRequestDispatcher(),
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      }).toString(),
      signal,
    },
  )
  if (!response.ok) {
    throw createHttpError(502, `Facebook authorization code exchange failed: ${response.status}`)
  }
  return response.json() as Promise<AuthorizationCodeAccessToken>
}

/* no-mistakes: integration=oauth */
async function exchangeFacebookAccessToken(
  accessToken: string,
  signal?: AbortSignal,
): Promise<LongLivedAccessToken> {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    throw new Error('FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be defined')
  }
  const response = await fetch(
    `https://graph.facebook.com/${FACEBOOK_GRAPHQL_VERSION}/oauth/access_token`,
    {
      dispatcher: getExternalRequestDispatcher(),
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        fb_exchange_token: accessToken,
      }).toString(),
      signal,
    },
  )
  if (!response.ok) throw createHttpError(502, `Facebook token exchange failed: ${response.status}`)
  const data = await response.json()
  return data as LongLivedAccessToken
}

/* no-mistakes: integration=oauth */
async function getMe(
  accessToken: string,
  queryFields: string,
  signal?: AbortSignal,
): Promise<FacebookUserData> {
  const response = await fetch(
    `https://graph.facebook.com/${FACEBOOK_GRAPHQL_VERSION}/me?fields=${queryFields}`,
    {
      dispatcher: getExternalRequestDispatcher(),
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    },
  )
  if (!response.ok) throw createHttpError(502, `Facebook /me request failed: ${response.status}`)
  return response.json() as unknown as FacebookUserData
}

export async function upsertFacebookAccount(
  accessToken: string,
  options: {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  const longLivedAccessToken = await exchangeFacebookAccessToken(accessToken, options.signal)
  if (longLivedAccessToken.error)
    throw createHttpError(502, 'Facebook token exchange failed', {
      cause: new Error(longLivedAccessToken.error.message),
    })
  const me = await getMe(longLivedAccessToken.access_token, fields, options.signal)
  return upsertOAuthAccount(
    'facebook',
    me.id,
    me.email ?? null,
    me,
    {
      accessToken: longLivedAccessToken.access_token,
      accessTokenExpiresAt: new Date(Date.now() + longLivedAccessToken.expires_in * 1000),
    },
    options,
  )
}

export async function upsertFacebookAuthorizationCodeAccount(
  code: string,
  redirectUri: string,
  options: {
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  const token = await exchangeFacebookAuthorizationCode(code, redirectUri, options.signal)
  if (token.error) {
    throw createHttpError(502, 'Facebook authorization code exchange failed', {
      cause: new Error(token.error.message),
    })
  }
  return upsertFacebookAccount(token.access_token, options)
}
