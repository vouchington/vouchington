import { describe } from 'vitest'
import { registerMcpRateLimitTests } from '@voucha/test-helpers/mcp-rate-limit'

describe('POST /api/v1/mcp rate limits', () => {
  registerMcpRateLimitTests({
    route: '/api/v1/mcp',
  })
})
