import createHttpError from 'http-errors'
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from '@voucha/config'
import { upsertOAuthAccount, type OAuthAccount } from '@services/oauth-accounts'
import {
  createProviderOperationSignal,
  getProviderFetch,
  rethrowProviderTransportError,
} from '@modules/api-egress-proxy'

type GithubTokenResponse = {
  access_token: string
  token_type: string
  scope: string
  error?: string
  error_description?: string
}

type GithubUserData = {
  id: number
  login: string
  name: string | null
  avatar_url?: string
  email?: string | null
}

type GithubEmailData = {
  email: string
  primary: boolean
  verified: boolean
}

/* no-mistakes: integration=oauth */
async function exchangeGithubAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier?: string,
  signal?: AbortSignal,
): Promise<GithubTokenResponse> {
  const response = await getProviderFetch('github_oauth_enabled')(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
      signal: createProviderOperationSignal(signal),
    },
  )
  if (!response.ok) throw createHttpError(502, `GitHub token exchange failed: ${response.status}`)
  return response.json() as Promise<GithubTokenResponse>
}

/* no-mistakes: integration=oauth */
async function fetchGithubUser(accessToken: string, signal?: AbortSignal): Promise<GithubUserData> {
  const response = await getProviderFetch('github_oauth_enabled')('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
    signal: createProviderOperationSignal(signal),
  })
  if (!response.ok) throw createHttpError(502, `GitHub /user request failed: ${response.status}`)
  return response.json() as Promise<GithubUserData>
}

/* no-mistakes: integration=oauth */
async function fetchGithubVerifiedPrimaryEmail(
  accessToken: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await getProviderFetch('github_oauth_enabled')(
    'https://api.github.com/user/emails',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
      signal: createProviderOperationSignal(signal),
    },
  )
  if (!response.ok)
    throw createHttpError(502, `GitHub /user/emails request failed: ${response.status}`)
  const emails = (await response.json()) as GithubEmailData[]
  return emails.find(email => email.primary && email.verified)?.email ?? null
}

export async function upsertGithubAccount(
  code: string,
  redirectUri: string,
  options: {
    codeVerifier?: string
    authorizationId?: string
    authorizationClaimId?: string
    signal?: AbortSignal
  } = {},
): Promise<OAuthAccount> {
  let tokenResponse: GithubTokenResponse
  try {
    tokenResponse = await exchangeGithubAuthorizationCode(
      code,
      redirectUri,
      options.codeVerifier,
      options.signal,
    )
  } catch (error) {
    rethrowProviderTransportError('GitHub', error)
  }
  if (tokenResponse.error) {
    throw createHttpError(502, 'OAuth token exchange failed', {
      cause: new Error(tokenResponse.error_description ?? tokenResponse.error),
    })
  }

  let githubUser: GithubUserData
  let verifiedPrimaryEmail: string | null
  try {
    ;[githubUser, verifiedPrimaryEmail] = await Promise.all([
      fetchGithubUser(tokenResponse.access_token, options.signal),
      fetchGithubVerifiedPrimaryEmail(tokenResponse.access_token, options.signal),
    ])
  } catch (error) {
    rethrowProviderTransportError('GitHub', error)
  }
  const providerUserData: Record<string, unknown> = {
    login: githubUser.login,
    name: githubUser.name ?? githubUser.login,
  }
  if (githubUser.avatar_url) providerUserData.avatar_url = githubUser.avatar_url

  return upsertOAuthAccount(
    'github',
    String(githubUser.id),
    verifiedPrimaryEmail,
    providerUserData,
    {
      accessToken: tokenResponse.access_token,
    },
    options,
  )
}
