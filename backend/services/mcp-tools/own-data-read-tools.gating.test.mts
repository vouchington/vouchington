import { describe } from 'vitest'
import { registerMcpReadToolGatingTests } from '@voucha/test-helpers/mcp-read-tool-gating'

// Every own-data read tool, the scope it needs and a valid call. get_my_notifications takes the
// REST route's page sizes (1 through 100), so its limit bounds are tested beside its contract.
describe('own bio, profile link, notification and preference read tool gating', () => {
  registerMcpReadToolGatingTests({
    scopes: ['profile:read', 'notifications:read', 'preferences:read'],
    tools: [
      ['get_my_bio', 'profile:read', {}],
      ['get_my_profile_links', 'profile:read', {}],
      ['get_my_notifications', 'notifications:read', {}],
      ['get_my_unread_notifications', 'notifications:read', {}],
      ['get_my_email_preferences', 'preferences:read', {}],
      ['get_my_preferences', 'preferences:read', {}],
    ],
    pagedTools: [],
    requiredArguments: [],
  })
})
