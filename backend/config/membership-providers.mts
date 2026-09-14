import { STRIPE_PROVIDER_ENVIRONMENT } from './stripe.mts'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'

export type MembershipProviderContext = {
  environment: 'test' | 'production'
  applicationId: string
}

const DEFAULT_APPLICATION_IDS = {
  apple_app_store: 'ai.voucha.ios',
  google_play: 'ai.voucha.android',
  microsoft_store: 'Voucha',
} as const

export function getMembershipProviderContext(
  provider: 'stripe' | 'apple_app_store' | 'google_play' | 'microsoft_store',
): MembershipProviderContext {
  if (provider === 'stripe')
    return { environment: STRIPE_PROVIDER_ENVIRONMENT, applicationId: 'voucha-web' }
  const environment = getDeployEnvironment() === 'production' ? 'production' : 'test'
  const variable = {
    apple_app_store: 'APPLE_APP_STORE_APPLICATION_ID',
    google_play: 'GOOGLE_PLAY_APPLICATION_ID',
    microsoft_store: 'MICROSOFT_STORE_APPLICATION_ID',
  }[provider]
  const configured = process.env[variable]
  if (getDeployEnvironment() === 'production' && !configured)
    throw new Error(`${variable} is required in production`)
  return { environment, applicationId: configured ?? DEFAULT_APPLICATION_IDS[provider] }
}
