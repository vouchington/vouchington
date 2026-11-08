import createHttpError from 'http-errors'
import { X_CLIENT_ID, X_CLIENT_SECRET } from '@voucha/config'
import { decryptSecret } from '@modules/token-secrets'
import { getOAuthTokenPurpose } from '@services/oauth-accounts/upsert'
import { fetch } from 'undici'
import { throwIfRateLimitedResponse } from '@modules/queue-errors'
import { getExternalRequestDispatcher } from '@modules/utils/http'
import {
  getXFriendSyncStartTime,
  getXSyncAccount,
  persistXRefreshedTokens,
  type XCredentialGeneration,
} from './friends-persistence.mts'
import type { FriendSyncResume } from '@queues/find-your-friends/types'
import { finalizeXFriendSync, persistXFriendPage } from './friend-pages.mts'
import { getOauthXWorkLimit } from './work-limits.mts'

/** Requested provider page size; a longer response is rejected so one page bounds its persist chunks. */
const X_FOLLOWING_PAGE_SIZE = 1000

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
  throwIfRateLimitedResponse(response, 'https://api.x.com/2/oauth2/token')
  if (!response.ok) throw createHttpError(502, `X token refresh failed: ${response.status}`)
  return response.json() as Promise<XTokenRefreshResponse>
}

/* no-mistakes: integration=oauth */
async function fetchXFollowing(
  xUserId: string,
  accessToken: string,
  nextToken?: string,
): Promise<XFollowingResponse> {
  const params = new URLSearchParams({ max_results: String(X_FOLLOWING_PAGE_SIZE) })
  if (nextToken) params.set('pagination_token', nextToken)
  const response = await fetch(
    `https://api.x.com/2/users/${xUserId}/following?${params.toString()}`,
    {
      dispatcher: getExternalRequestDispatcher(),
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  throwIfRateLimitedResponse(response, 'https://api.x.com/2/users/:id/following')
  if (!response.ok) throw createHttpError(502, `X /following request failed: ${response.status}`)
  return response.json() as Promise<XFollowingResponse>
}

type XSyncAccount = NonNullable<Awaited<ReturnType<typeof getXSyncAccount>>>

/** Returns a usable access token, refreshing and persisting it first; null when the credentials were superseded. */
async function resolveXAccessToken(
  xUserId: string,
  account: XSyncAccount & { userId: string },
): Promise<string | null> {
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
    if (!persisted) return null
  }
  return accessToken
}

/**
 * Syncs one run of provider pages, then stale-edge cleanup. Returns the position the follow-up
 * job resumes from when a per-run cap is reached, or null once the sync is complete or superseded.
 */
export async function syncXFriends(
  xUserId: string,
  resume?: FriendSyncResume,
): Promise<FriendSyncResume | null> {
  const account = await getXSyncAccount(xUserId)
  if (!account?.userId) return null
  const syncStartTime = resume?.syncStartTime ?? (await getXFriendSyncStartTime())

  if (resume?.phase !== 'finalize') {
    const accessToken = await resolveXAccessToken(xUserId, { ...account, userId: account.userId })
    if (accessToken === null) return null
    const maxPages = getOauthXWorkLimit('max_provider_pages_per_run')
    let nextToken = resume?.cursor
    let exhausted = false
    for (let page = 0; page < maxPages && !exhausted; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- the next X pagination token comes from the current response
      const result = await fetchXFollowing(xUserId, accessToken, nextToken)
      if (result.errors?.length)
        throw createHttpError(502, `X following error: ${result.errors[0].message}`)
      const ids = (result.data ?? []).map(user => user.id)
      if (ids.length > X_FOLLOWING_PAGE_SIZE)
        throw createHttpError(502, 'X /following returned more users than requested')
      // oxlint-disable-next-line no-await-in-loop -- each provider page commits before requesting its successor.
      const persisted = await persistXFriendPage(account.id, account.userId, ids, syncStartTime)
      if (!persisted) return null
      nextToken = result.meta?.next_token
      exhausted = !nextToken
    }
    if (!exhausted) return { phase: 'pages', syncStartTime, cursor: nextToken }
  }

  const lastFinalizedKey = await finalizeXFriendSync(
    account.id,
    account.userId,
    syncStartTime,
    resume?.phase === 'finalize' ? resume.cursor : undefined,
  )
  return lastFinalizedKey === null
    ? null
    : { phase: 'finalize', syncStartTime, cursor: lastFinalizedKey }
}
