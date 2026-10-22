import { OAUTH_AUDIENCE_REQUIRES_ADMINISTRATOR } from '@services/oauth-authorization-server/resources'
import { ALL_MCP_SERVER_CONFIGS } from './config.mts'

/** Public capability facts for the scope picker; display copy belongs to the client locale. */
export function listScopeAudiencePolicies() {
  return ALL_MCP_SERVER_CONFIGS.map(({ audience, acceptsApiKeys }) => ({
    audience,
    accepts_api_keys: acceptsApiKeys,
    requires_administrator: OAUTH_AUDIENCE_REQUIRES_ADMINISTRATOR[audience],
  }))
}
