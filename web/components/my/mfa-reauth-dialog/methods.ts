import type { ReAuthMethods } from '@/lib/api/client'
import type { OAuthProvider } from '@/types/user'

export type ReauthMethod = 'totp' | 'email' | 'passkey' | OAuthProvider

export function availableReAuthMethods(methods: ReAuthMethods): ReauthMethod[] {
  return [
    ...(methods.has_totp ? ['totp' as const] : []),
    ...(methods.has_email ? ['email' as const] : []),
    ...(methods.has_passkey ? ['passkey' as const] : []),
    ...methods.providers,
  ]
}
