import type { PreparedOAuthAccount } from '@services/oauth-accounts/reauthentication'
import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import type { OAuthProvider, OAuthAccount } from './providers.mts'
import { prepareGoogleAccount } from '@services/oauth-google'
import { prepareLinkedInAccount } from '@services/oauth-linkedin'
import { prepareMicrosoftAccount } from '@services/oauth-microsoft'
import { prepareFacebookAccount } from '@services/oauth-facebook'
import { prepareGithubAccount } from '@services/oauth-github'
import { prepareXAccount } from '@services/oauth-x'
import { prepareAppleAccount } from '@services/oauth-apple'
import { parseOAuthCallbackBody } from './parse-oauth-callback-body.mts'

type UpsertResult = { account: OAuthAccount; name: string }

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export async function prepareProviderAccount(
  provider: OAuthProvider,
  body: Record<string, unknown>,
  expectedOrigin?: string,
  options: { requireAppleVerifiedEmail?: boolean; query?: TransactionQuery } = {},
): Promise<PreparedOAuthAccount> {
  switch (provider) {
    case 'facebook': {
      const token = str(body.token)
      if (!token) throw createHttpError(422, 'token is required')
      const account = await prepareFacebookAccount(token, { query: options.query })
      return account
    }
    case 'apple': {
      const token = str(body.token)
      if (!token) throw createHttpError(422, 'token is required')
      const nonce = str(body.nonce)
      const userData =
        body.userData && typeof body.userData === 'object'
          ? (body.userData as { name?: string })
          : undefined
      const account = await prepareAppleAccount(token, userData, nonce, {
        requireVerifiedEmail: options.requireAppleVerifiedEmail,
        query: options.query,
      })
      return account
    }
    case 'google': {
      const credential = str(body.credential)
      if (!credential) throw createHttpError(422, 'credential is required')
      const account = await prepareGoogleAccount(credential, { query: options.query })
      return account
    }
    case 'x': {
      const { code, redirectUri, codeVerifier } = parseOAuthCallbackBody(
        body,
        'x',
        expectedOrigin,
        {
          requireCodeVerifier: true,
        },
      )
      const account = await prepareXAccount(code, redirectUri, codeVerifier, {
        query: options.query,
      })
      return account
    }
    case 'linkedin': {
      const { code, redirectUri, codeVerifier } = parseOAuthCallbackBody(
        body,
        'linkedin',
        expectedOrigin,
        { requireCodeVerifier: true },
      )
      const account = await prepareLinkedInAccount(code, redirectUri, codeVerifier, {
        query: options.query,
      })
      return account
    }
    case 'microsoft': {
      const { code, redirectUri, codeVerifier } = parseOAuthCallbackBody(
        body,
        'microsoft',
        expectedOrigin,
        { requireCodeVerifier: true },
      )
      const account = await prepareMicrosoftAccount(code, redirectUri, codeVerifier, {
        query: options.query,
      })
      return account
    }
    case 'github': {
      const { code, redirectUri } = parseOAuthCallbackBody(body, 'github', expectedOrigin, {
        requireCodeVerifier: false,
      })
      const account = await prepareGithubAccount(code, redirectUri, { query: options.query })
      return account
    }
    default:
      throw createHttpError(400, `Unsupported provider: ${provider}`)
  }
}

export async function upsertProviderAccount(
  provider: OAuthProvider,
  body: Record<string, unknown>,
  expectedOrigin?: string,
  options: { requireAppleVerifiedEmail?: boolean; query?: TransactionQuery } = {},
): Promise<UpsertResult> {
  const prepared = await prepareProviderAccount(provider, body, expectedOrigin, options)
  const account = await prepared.persist({ query: options.query })
  return { account, name: str(account.provider_user_data.name) ?? '' }
}
