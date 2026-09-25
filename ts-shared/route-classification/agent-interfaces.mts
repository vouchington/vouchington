/**
 * Authenticated interfaces built for AI agents that public discovery documents may name by exact
 * path. Each path stays classified private by `isPrivateDiscoveryPath`, so pages at these paths
 * never carry discovery `Link` headers. See docs/requirements/platform/agent-access.md.
 */
export const ADVERTISED_AGENT_INTERFACE_PATHS = Object.freeze({
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

/**
 * Removes each advertised agent-interface URL from a discovery document so callers can scan the
 * remainder for private paths. Only a complete URL followed by a non-path character is removed,
 * so a near miss such as `/api/v1/mcpx` or `/api/v1/mcp/admin` stays in the text.
 */
export function removeAdvertisedAgentInterfaceUrls(document: string, siteOrigin: string): string {
  const urls = Object.values(buildAdvertisedAgentInterfaceUrls(siteOrigin))
  const alternatives = urls.map(url => RegExp.escape(url)).join('|')
  return document.replaceAll(new RegExp(`(?:${alternatives})(?![\\w/.~%-])`, 'g'), '')
}
