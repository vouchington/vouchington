import createHttpError from 'http-errors'
import { X_CLIENT_ID, X_CLIENT_SECRET } from '@voucha/config'
import { decryptSecret } from '@modules/token-secrets'
import { getOAuthTokenPurpose } from '@services/oauth-accounts/upsert'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import {
  getXFriendSyncStartTime,
  getXSyncAccount,
  persistXRefreshedTokens,
  type XCredentialGeneration,
} from './friends-persistence.mts'
import { finalizeXFriendSync, persistXFriendPage } from './friend-pages.mts'

type XFollowingResponse = {
  data?: Array<{ id: string; name: string; username: string }>
  meta?: { next_token?: string; result_count?: number }
  errors?: Array<{ message: string }>
}

type XTokenRefreshResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

/* no-mistakes: integration=oauth */
async function refreshXAccessToken(refreshToken: string): Promise<XTokenRefreshResponse> {
  const credentials = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')
  const response = await fetch('https://api.x.com/2/oauth2/token', {
    dispatcher: getExternalRequestDispatcher(),
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })
  if (!response.ok) throw createHttpError(502, `X token refresh failed: ${response.status}`)
  return response.json() as Promise<XTokenRefreshResponse>
}

/* no-mistakes: integration=oauth */
async function fetchXFollowing(
  xUserId: string,
  accessToken: string,
  nextToken?: string,
): Promise<XFollowingResponse> {
  const params = new URLSearchParams({ max_results: '1000' })
  if (nextToken) params.set('pagination_token', nextToken)
  const response = await fetch(
    `https://api.x.com/2/users/${xUserId}/following?${params.toString()}`,
    {
      dispatcher: getExternalRequestDispatcher(),
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!response.ok) throw createHttpError(502, `X /following request failed: ${response.status}`)
  return response.json() as Promise<XFollowingResponse>
}

export async function syncXFriends(xUserId: string): Promise<void> {
  const account = await getXSyncAccount(xUserId)
  if (!account?.userId) return

  const credentialGeneration: XCredentialGeneration = {
    accessTokenCiphertext: account.accessTokenCiphertext,
    refreshTokenCiphertext: account.refreshTokenCiphertext,
    accessTokenExpiresAt: account.accessTokenExpiresAtText,
  }

  let accessToken = decryptSecret(
    account.accessTokenCiphertext,
    getOAuthTokenPurpose('x', xUserId, 'access_token'),
  )
  const expiresAt = account.accessTokenExpiresAt
  const refreshToken = account.refreshTokenCiphertext
    ? decryptSecret(
        account.refreshTokenCiphertext,
        getOAuthTokenPurpose('x', xUserId, 'refresh_token'),
      )
    : null

  // Refresh token if expired or expiring soon
  if (expiresAt && refreshToken && expiresAt.getTime() < Date.now() + 60_000) {
    const refreshed = await refreshXAccessToken(refreshToken)
    if (refreshed.error)
      throw createHttpError(
        502,
        `X token refresh failed: ${refreshed.error_description ?? refreshed.error}`,
      )
    accessToken = refreshed.access_token
    const newExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : null
    const refreshedTokens = {
      accessToken,
      refreshToken: refreshed.refresh_token ?? refreshToken,
      expiresAt: newExpiresAt,
    }
    const persisted = await persistXRefreshedTokens(
      xUserId,
      account.userId,
      credentialGeneration,
      refreshedTokens,
    )
    if (!persisted) return
  }

  const syncStartTime = await getXFriendSyncStartTime()

  let nextToken: string | undefined

  do {
    // oxlint-disable-next-line no-await-in-loop -- the next X pagination token comes from the current response
    const result = await fetchXFollowing(xUserId, accessToken, nextToken)
    if (result.errors?.length)
      throw createHttpError(502, `X following error: ${result.errors[0].message}`)
    // oxlint-disable-next-line no-await-in-loop -- each provider page commits before requesting its successor.
    const persisted = await persistXFriendPage(
      xUserId,
      account.userId,
      (result.data ?? []).map(user => user.id),
    )
    if (!persisted) return
    nextToken = result.meta?.next_token
  } while (nextToken)

  await finalizeXFriendSync(xUserId, account.userId, syncStartTime)
}
