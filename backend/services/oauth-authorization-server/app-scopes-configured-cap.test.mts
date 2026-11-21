import { describe, expect, it, onTestFinished } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { randomTestOAuthRedirectUri } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { userProductLimitsConfig } from '@services/user-product-limits'
import { createOwnedOAuthApp } from './index.mts'

describe('configured OAuth app scopes cap', () => {
  it('rejects an app requesting more scopes than the cap and accepts exactly the cap', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userProductLimitsConfig, { oauth_app_scopes_max: 1 }),
    )
    const owner = await createTestUserDirect()
    const input = (scopes: string[]) => ({
      client_name: `Capped app ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
      scopes,
    })

    await expect(
      createOwnedOAuthApp(owner.id, input(['mcp.user:read', 'mcp.user:write'])),
    ).rejects.toThrow('scopes must list canonical scopes')
    await expect(createOwnedOAuthApp(owner.id, input(['mcp.user:read']))).resolves.toBeDefined()
  })
})
