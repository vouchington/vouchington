import type { OAuthProvider } from '@/types/user'

export type BrokerOAuthProvider = Extract<
  OAuthProvider,
  'facebook' | 'x' | 'github' | 'linkedin' | 'microsoft'
>

export function isOAuthBrokerProvider(provider: OAuthProvider): provider is BrokerOAuthProvider {
  return ['facebook', 'x', 'github', 'linkedin', 'microsoft'].includes(provider)
}
