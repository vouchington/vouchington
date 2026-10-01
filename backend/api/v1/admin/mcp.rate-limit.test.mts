import { describe } from 'vitest'
import { registerMcpRateLimitTests } from '@voucha/test-helpers/mcp-rate-limit'

describe('POST /api/v1/admin/mcp rate limits', () => {
  registerMcpRateLimitTests({
    route: '/api/v1/admin/mcp',
    administrator: true,
    tokenOptions: { audience: 'admin', scope: 'mcp.admin:read' },
  })
})
