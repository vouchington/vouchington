import { accountAndFeedsEndpointRegistry } from './non-web-account-and-feeds-registry'
import { authAndFediverseEndpointRegistry } from './non-web-auth-and-fediverse-registry'
import { contentAndProfilesEndpointRegistry } from './non-web-content-and-profiles-registry'
import { communityEndpointRegistry } from './community-registry'
import { engineeringEndpointRegistry } from './engineering-registry'
import { crmEndpointRegistry } from './crm-registry'
import { nonWebClientEndpointRegistry } from './non-web-registry'
import { moderationEndpointRegistry } from './moderation-registry'
import { nativeSupportEndpointRegistry } from './native-support-registry'
import { resourceEndpointRegistry } from './resource-registry'
import { agentEndpointRegistry } from './agent-registry'
import { mergeEndpointRegistries } from './endpoint-registry'

export const nonWebEndpointRegistry = mergeEndpointRegistries(
  authAndFediverseEndpointRegistry,
  accountAndFeedsEndpointRegistry,
  contentAndProfilesEndpointRegistry,
  nonWebClientEndpointRegistry,
  communityEndpointRegistry,
  engineeringEndpointRegistry,
  crmEndpointRegistry,
  moderationEndpointRegistry,
  nativeSupportEndpointRegistry,
  resourceEndpointRegistry,
  agentEndpointRegistry,
)
