import { accountAndFeedsEndpointRegistry } from './non-web-account-and-feeds-registry'
import { authAndFediverseEndpointRegistry } from './non-web-auth-and-fediverse-registry'
import { contentAndProfilesEndpointRegistry } from './non-web-content-and-profiles-registry'
import { communityEndpointRegistry } from './community-registry'
import { engineeringEndpointRegistry } from './engineering-registry'
import { nonWebClientEndpointRegistry } from './non-web-registry'
import { moderationEndpointRegistry } from './moderation-registry'
import { resourceEndpointRegistry } from './resource-registry'
import { mergeEndpointRegistries } from './endpoint-registry'

export const nonWebEndpointRegistry = mergeEndpointRegistries(
  authAndFediverseEndpointRegistry,
  accountAndFeedsEndpointRegistry,
  contentAndProfilesEndpointRegistry,
  nonWebClientEndpointRegistry,
  communityEndpointRegistry,
  engineeringEndpointRegistry,
  moderationEndpointRegistry,
  resourceEndpointRegistry,
)
