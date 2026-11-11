import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { describe } from 'vitest'
import { registerMcpReadToolGatingTests } from '@voucha/test-helpers/mcp-read-tool-gating'

// Every own-data read tool, the scope it needs and a valid call. read_my_notifications takes the
// REST route's page sizes (1 through 100), so their
// limit bounds are tested beside their contracts.
describe('own bio, profile link, notification, preference read tool gating', () => {
  registerMcpReadToolGatingTests({
    scopes: ['profile:read', 'notifications:read', 'preferences:read'],
    tools: [
      ['read_my_profile', 'profile:read', optionArgs('bio', {})],
      ['read_my_profile', 'profile:read', optionArgs('links', {})],
      ['read_my_notifications', 'notifications:read', optionArgs('list', {})],
      ['read_my_notifications', 'notifications:read', optionArgs('unread', {})],
      ['read_my_preferences', 'preferences:read', optionArgs('email', {})],
      ['read_my_preferences', 'preferences:read', optionArgs('general', {})],
    ],
    pagedTools: [],
    requiredArguments: [],
  })
})
