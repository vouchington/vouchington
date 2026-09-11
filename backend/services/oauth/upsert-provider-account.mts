import createHttpError from 'http-errors'
import type { OAuthProvider, OAuthAccount } from './providers.mts'
import { upsertGoogleAccount } from '@services/oauth-google'
import { upsertLinkedInAccount } from '@services/oauth-linkedin'
import { upsertMicrosoftAccount } from '@services/oauth-microsoft'
import { upsertFacebookAccount } from '@services/oauth-facebook'
import { upsertGithubAccount } from '@services/oauth-github'
import { upsertXAccount } from '@services/oauth-x'
import { upsertAppleAccount } from '@services/oauth-apple'
import { parseOAuthCallbackBody } from './parse-oauth-callback-body.mts'

type UpsertResult = { account: OAuthAccount; name: string }

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export async function upsertProviderAccount(
  provider: OAuthProvider,
  body: Record<string, unknown>,
  expectedOrigin?: string,
  options: { requireAppleVerifiedEmail?: boolean } = {},
): Promise<UpsertResult> {
  switch (provider) {
    case 'facebook': {
      const token = str(body.token)
      if (!token) throw createHttpError(422, 'token is required')
      const account = await upsertFacebookAccount(token)
      return { account, name: str(account.provider_user_data.name) ?? '' }
    }
    case 'apple': {
      const token = str(body.token)
      if (!token) throw createHttpError(422, 'token is required')
      const nonce = str(body.nonce)
      const userData =
        body.userData && typeof body.userData === 'object'
          ? (body.userData as { name?: string })
          : undefined
      const account = await upsertAppleAccount(token, userData, nonce, {
        requireVerifiedEmail: options.requireAppleVerifiedEmail,
      })
      return { account, name: str(account.provider_user_data.name) ?? '' }
    }
    case 'google': {
      const credential = str(body.credential)
      if (!credential) throw createHttpError(422, 'credential is required')
      const account = await upsertGoogleAccount(credential)
      return { account, name: str(account.provider_user_data.name) ?? '' }
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
      const account = await upsertXAccount(code, redirectUri, codeVerifier)
      return { account, name: str(account.provider_user_data.name) ?? '' }
    }
    case 'linkedin': {
      const { code, redirectUri, codeVerifier } = parseOAuthCallbackBody(
        body,
        'linkedin',
        expectedOrigin,
        { requireCodeVerifier: true },
      )
      const account = await upsertLinkedInAccount(code, redirectUri, codeVerifier)
      return { account, name: str(account.provider_user_data.name) ?? '' }
    }
    case 'microsoft': {
      const { code, redirectUri, codeVerifier } = parseOAuthCallbackBody(
        body,
        'microsoft',
        expectedOrigin,
        { requireCodeVerifier: true },
      )
      const account = await upsertMicrosoftAccount(code, redirectUri, codeVerifier)
      return { account, name: str(account.provider_user_data.name) ?? '' }
    }
    case 'github': {
      const { code, redirectUri } = parseOAuthCallbackBody(body, 'github', expectedOrigin, {
        requireCodeVerifier: false,
      })
      const account = await upsertGithubAccount(code, redirectUri)
      return { account, name: str(account.provider_user_data.name) ?? '' }
    }
    default:
      throw createHttpError(400, `Unsupported provider: ${provider}`)
  }
}
