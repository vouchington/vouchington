import { exclusions } from './mcp-write-exclusions-builder.mts'

// The MCP endpoint carries protocol messages rather than exposing a REST tool operation.
export const mcpProtocolExclusions = [
  ...exclusions(
    'webhook-or-infra',
    'MCP JSON-RPC transport endpoint; requests dispatch through the protocol, not a REST tool operation',
    ['POST /community-moderation/mcp', 'POST /legal/mcp', 'POST /admin/mcp'],
  ),
  ...exclusions(
    'method-not-allowed',
    'MCP transport accepts POST only; this endpoint rejects the HTTP method',
    [
      'GET /community-moderation/mcp',
      'DELETE /community-moderation/mcp',
      'GET /legal/mcp',
      'DELETE /legal/mcp',
      'GET /mcp',
      'GET /admin/mcp',
      'DELETE /admin/mcp',
    ],
  ),
]
