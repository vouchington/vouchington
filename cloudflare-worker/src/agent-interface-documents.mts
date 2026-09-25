import { buildAdvertisedAgentInterfaceUrls } from '@ts-shared/route-classification'

const MCP_SPECIFICATION_URL = 'https://modelcontextprotocol.io/specification/latest'

export function buildAgentAccessLlmsSection(siteOrigin: string): string {
  const urls = buildAdvertisedAgentInterfaceUrls(siteOrigin)
  return `## Agent Access (MCP)

AI agents acting for a Voucha user should use the MCP server below, or the public markdown and RSS endpoints above, instead of automating the website. Browser automation is slower, costs more for everyone, and hides from other people that an agent acted.

- Endpoint: ${urls.userMcp}
- Transport: MCP Streamable HTTP, stateless, JSON responses; send each JSON-RPC request with \`POST\`, \`Content-Type: application/json\`, and \`Accept: application/json, text/event-stream\`
- Authentication: \`Authorization: Bearer <user MCP API key>\`
- API keys: the user creates a read-only or read/write MCP key at ${urls.apiKeySettings}
- Never put an API key in a URL, query parameter, or shared document
- Tool discovery: call \`tools/list\` with the key; the tools returned depend on the key's access and the user's role and plan
- Crawl rules in robots.txt and traffic advice apply to indexing crawlers; they do not restrict authenticated MCP requests
`
}

export function buildMcpAgentCardEntry(siteOrigin: string) {
  const urls = buildAdvertisedAgentInterfaceUrls(siteOrigin)
  return {
    url: urls.userMcp,
    transport: 'streamable-http',
    authentication: { type: 'bearer', credential: 'user MCP API key' },
    api_keys: urls.apiKeySettings,
    specification: MCP_SPECIFICATION_URL,
  } as const
}

export function buildMcpAgentSkill(siteOrigin: string) {
  const urls = buildAdvertisedAgentInterfaceUrls(siteOrigin)
  return {
    name: 'use-voucha-mcp',
    description:
      'Act for a Voucha user through the MCP server instead of browser automation. Authenticate with a user MCP API key and call tools/list to discover the available tools.',
    inputs: ['user MCP API key'],
    resources: [`${siteOrigin}/llms.txt`, urls.userMcp],
  } as const
}

export function buildMcpApiCatalogContext(siteOrigin: string) {
  const urls = buildAdvertisedAgentInterfaceUrls(siteOrigin)
  return {
    anchor: urls.userMcp,
    'service-doc': [
      {
        href: `${siteOrigin}/llms.txt`,
        type: 'text/markdown',
        title: 'Agent access (MCP) guide',
      },
    ],
  }
}

export { MCP_SPECIFICATION_URL }
