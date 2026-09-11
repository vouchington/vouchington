import { apiEgressProxyConfig } from '@services/api-egress-proxy'
import { oauthAuthorizationBrokerConfig } from '@services/oauth'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

// Per-service direct/proxied routing flags for external API calls. Kept in its own file so future flags
// (one field per migrated integration) don't push registry-operational-entries.mts over the
// 200-line file cap.
export const externalProxyDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'oauth-authorization-broker',
    label: 'OAuth Authorization Broker',
    description:
      'Default-off provider and callback-mode rollout controls for the shared OAuth broker.',
    config: oauthAuthorizationBrokerConfig,
    access: { update_roles: ['developer'] },
    fields: {
      facebook_web_enabled: {
        description: 'Allow new Facebook web authorization broker flows.',
      },
      facebook_native_enabled: {
        description: 'Allow new Facebook native authorization broker flows.',
      },
      x_web_enabled: {
        description: 'Allow new X web authorization broker flows.',
      },
      x_native_enabled: {
        description: 'Allow new X native authorization broker flows.',
      },
      github_web_enabled: {
        description: 'Allow new GitHub web authorization broker flows.',
      },
      github_native_enabled: {
        description: 'Allow new GitHub native authorization broker flows.',
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'api-egress-proxy',
    label: 'API Egress Proxy',
    description: 'Per-provider direct or API-egress-proxy routing controls for external API calls.',
    config: apiEgressProxyConfig,
    access: { update_roles: ['developer'] },
    fields: {
      openai_moderation_enabled: {
        description: 'Routes OpenAI moderation through the API egress proxy.',
      },
      apple_oauth_enabled: {
        description: 'Routes Apple OAuth through the API egress proxy.',
      },
      github_oauth_enabled: {
        description: 'Routes GitHub OAuth through the API egress proxy.',
      },
      x_oauth_enabled: {
        description: 'Routes X OAuth through the API egress proxy.',
      },
      bluesky_oauth_enabled: {
        description: 'Routes Bluesky OAuth through the API egress proxy.',
      },
      fediverse_search_enabled: {
        description:
          'Routes Fediverse search and instance classification through the API egress proxy.',
      },
      stripe_enabled: {
        description: 'Routes Stripe calls through the API egress proxy.',
      },
      bedrock_embeddings_enabled: {
        description: 'Routes API-originated Bedrock embeddings through the API egress proxy.',
      },
    },
  }),
]
