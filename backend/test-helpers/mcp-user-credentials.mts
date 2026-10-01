import { createApiKey } from '../services/api-keys/index.mts'
import {
  createMcpCallAuditContext,
  recordMcpCallAudit,
  USER_MCP_SERVER_CONFIG,
} from '../services/mcp-tools/index.mts'
import { issueTestOAuthTokensForClient } from './services/oauth-authorization-server/test-support.mts'
import { createTestUser } from './entities/users.mts'

export type UserMcpCredentialKind = 'oauth' | 'api_key'

// A fresh user with one credential for the user MCP surface, plus the audit identity a call made
// with it must be recorded under: the public OAuth client_id, or the API key id.
export async function issueTestUserMcpCredential(kind: UserMcpCredentialKind, scope: string) {
  const user = await createTestUser()
  if (kind === 'oauth') {
    const { clientId, tokens } = await issueTestOAuthTokensForClient(user, { scope })
    return {
      user,
      token: tokens.access_token,
      identity: { oauth_client_id: clientId, api_key_id: null },
    }
  }
  const { apiKey, rawKey } = await createApiKey(user.id, 'mcp', 'Audited MCP key', [scope])
  return { user, token: rawKey, identity: { oauth_client_id: null, api_key_id: apiKey.id } }
}

export async function createTestUserWithApiKey() {
  const user = await createTestUser()
  const { apiKey } = await createApiKey(user.id, 'mcp', 'Deleted with its owner', ['topics:read'])
  return { user, apiKeyId: apiKey.id }
}

// Writes the audit row an accepted user MCP call with this API key leaves behind.
export async function recordTestApiKeyCallAudit(userId: string, apiKeyId: string): Promise<void> {
  const context = createMcpCallAuditContext(USER_MCP_SERVER_CONFIG, userId, {
    credential: 'api_key',
    apiKeyId,
  })
  await recordMcpCallAudit(context, [
    { jsonrpcMethod: 'tools/list', toolName: null, outcome: 'accepted' },
  ])
}
