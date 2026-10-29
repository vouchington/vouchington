/**
 * Authenticated interfaces built for AI agents that public discovery documents may name by exact
 * path. Each path stays classified private by `isPrivateDiscoveryPath`, so pages at these paths
 * never carry discovery `Link` headers. See docs/requirements/platform/agent-access.md.
 */
const ADVERTISED_AGENT_INTERFACE_PATHS = Object.freeze({
  userMcp: '/api/v1/mcp',
  apiKeySettings: '/my/api-keys',
} as const)

export type AdvertisedAgentInterface = keyof typeof ADVERTISED_AGENT_INTERFACE_PATHS

export type AdvertisedAgentInterfaceUrls = Readonly<Record<AdvertisedAgentInterface, string>>

export function buildAdvertisedAgentInterfaceUrls(
  siteOrigin: string,
): AdvertisedAgentInterfaceUrls {
  return {
    userMcp: `${siteOrigin}${ADVERTISED_AGENT_INTERFACE_PATHS.userMcp}`,
    apiKeySettings: `${siteOrigin}${ADVERTISED_AGENT_INTERFACE_PATHS.apiKeySettings}`,
  }
}
