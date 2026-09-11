import { DynamicConfig, type DynamicConfigFieldType } from '@data-stores/valkey'
import type { ApiEgressProxyProvider } from '@modules/api-egress-proxy'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'

const fieldTypes = {
  stripe_enabled: 'boolean',
  openai_moderation_enabled: 'boolean',
  apple_oauth_enabled: 'boolean',
  github_oauth_enabled: 'boolean',
  x_oauth_enabled: 'boolean',
  bluesky_oauth_enabled: 'boolean',
  fediverse_search_enabled: 'boolean',
  bedrock_embeddings_enabled: 'boolean',
} as const satisfies Record<ApiEgressProxyProvider, DynamicConfigFieldType>

const enabledByDefault = isDeployedEnvironment()
export const apiEgressProxyConfig = new DynamicConfig({
  key: 'api-egress-proxy',
  fieldTypes,
  defaultFields: Object.fromEntries(
    Object.keys(fieldTypes).map(key => [key, enabledByDefault]),
  ) as Record<ApiEgressProxyProvider, boolean>,
})

export function isApiEgressProxyEnabled(provider: ApiEgressProxyProvider): boolean {
  return apiEgressProxyConfig.getFields()[provider] === true
}
