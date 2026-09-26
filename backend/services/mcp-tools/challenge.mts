import { getOAuthResourceMetadataUrl } from '@services/oauth-authorization-server'
import { withScopePrerequisites, type ApiScope } from '@modules/scopes'
import type { McpServerConfig } from './config.mts'

export type McpBearerChallenge =
  | { error: 'missing_credential' }
  | { error: 'invalid_token' }
  | { error: 'insufficient_scope'; scopes: readonly ApiScope[] }

// RFC 6750 and RFC 9728 challenges. A missing credential advertises the audience's read and write
// pair because MCP clients register with the challenge scope, and that registration caps every
// later step-up.
export function buildMcpBearerChallenge(
  config: McpServerConfig,
  challenge: McpBearerChallenge,
): string {
  const parameters: Array<[string, string]> = [
    ['resource_metadata', getOAuthResourceMetadataUrl(config.audience)],
  ]
  if (challenge.error === 'missing_credential') {
    parameters.push(['scope', withScopePrerequisites([`mcp.${config.audience}:write`]).join(' ')])
  } else if (challenge.error === 'invalid_token') {
    parameters.push(
      ['error', 'invalid_token'],
      ['error_description', 'The bearer credential is invalid or expired'],
    )
  } else {
    parameters.push(
      ['error', 'insufficient_scope'],
      ['error_description', 'The access token lacks a scope this tool requires'],
      ['scope', challenge.scopes.join(' ')],
    )
  }
  return `Bearer ${parameters.map(([name, value]) => `${name}="${value}"`).join(', ')}`
}
