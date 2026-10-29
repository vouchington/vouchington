import { buildAdvertisedAgentInterfaceUrls } from '@ts-shared/route-classification'

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
