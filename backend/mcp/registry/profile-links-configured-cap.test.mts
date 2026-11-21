import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { createProfileLink, listProfileLinks } from '@services/my/profile-links'
import { userProductLimitsConfig } from '@services/user-product-limits'

describe('configured profile links cap', () => {
  it('add_my_profile_link refuses a link beyond the configured limit', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userProductLimitsConfig, { profile_links_max: 2 }),
    )
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    for (let index = 0; index < 2; index++) {
      await createProfileLink(caller.id, { link_type: 'url', url: `https://example.com/${index}` })
    }

    await callRejectedMcpTool(
      caller,
      'add_my_profile_link',
      { link_type: 'url', url: 'https://example.com/over' },
      ['profile:read', 'profile:write'],
    )

    expect(await listProfileLinks(caller.id)).toHaveLength(2)
  })
})
