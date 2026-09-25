import { buildAdvertisedAgentInterfaceUrls } from '@ts-shared/route-classification'

const MCP_SPECIFICATION_URL = 'https://modelcontextprotocol.io/specification/latest'

export function buildAgentAccessLlmsSection(siteOrigin: string): string {
  const urls = buildAdvertisedAgentInterfaceUrls(siteOrigin)
  return `## Agent Access (MCP)

AI agents acting for a Voucha user should use the MCP server below, or the public markdown and RSS endpoints above, instead of automating the website. Browser automation is slower, costs more for everyone, and hides from other people that an agent acted.

- Endpoint: ${urls.userMcp}
- Transport: MCP Streamable HTTP, stateless, JSON responses; send each JSON-RPC request with \`POST\`, \`Content-Type: application/json\`, and \`Accept: application/json, text/event-stream\`
- Authentication: \`Authorization: Bearer <OAuth access token or user MCP API key>\`
- OAuth: a request without a credential gets \`401\` with a \`WWW-Authenticate\` header whose \`resource_metadata\` URL (RFC 9728) leads to the authorization server; ask the user to approve \`mcp.user:read\`, plus \`mcp.user:write\` only when they want the agent to make changes
- Step-up: a \`403\` with \`error="insufficient_scope"\` names the scopes to re-authorize with for that tool
- API keys: for clients without OAuth, the user creates a read-only or read/write MCP key at ${urls.apiKeySettings}
- Never put an access token or API key in a URL, query parameter, or shared document
- Tool discovery: call \`tools/list\` with the credential; the tools returned depend on its scopes and the user's role and plan
- Crawl rules in robots.txt and traffic advice apply to indexing crawlers; they do not restrict authenticated MCP requests
`
}

export function buildMcpAgentCardEntry(siteOrigin: string) {
  const urls = buildAdvertisedAgentInterfaceUrls(siteOrigin)
  return {
    url: urls.userMcp,
    transport: 'streamable-http',
    authentication: { type: 'bearer', credentials: ['OAuth access token', 'user MCP API key'] },
    api_keys: urls.apiKeySettings,
    specification: MCP_SPECIFICATION_URL,
  } as const
}

export function buildMcpAgentSkill(siteOrigin: string) {
  const urls = buildAdvertisedAgentInterfaceUrls(siteOrigin)
  return {
    name: 'use-voucha-mcp',
    description:
      'Act for a Voucha user through the MCP server instead of browser automation. Authenticate with OAuth, discovered from the 401 WWW-Authenticate challenge, or with a user MCP API key, then call tools/list to discover the available tools.',
    inputs: ['OAuth access token or user MCP API key'],
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
