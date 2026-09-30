import { describe, expect, it } from 'vitest'
import { hasTestRetainedIdentityRoot } from '@voucha/test-helpers'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import {
  createTestUserWithApiKey,
  recordTestApiKeyCallAudit,
} from '@voucha/test-helpers/mcp-user-credentials'
import { deleteUserAndDrainForTest } from '@services/users/delete-test-support'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'

async function createApiKeyOwner(audited: boolean) {
  const owner = await createTestUserWithApiKey()
  if (audited) await recordTestApiKeyCallAudit(owner.user.id, owner.apiKeyId)
  return owner
}

describe('retained API key identity roots', () => {
  it('registers a root for a new key and keeps it while the live key exists', async () => {
    const { apiKeyId } = await createApiKeyOwner(false)

    expect(await hasTestRetainedIdentityRoot('api_key', apiKeyId)).toBe(true)
    await cleanupRetainedIdentityRoots(1_000, { api_key: [apiKeyId] })
    expect(await hasTestRetainedIdentityRoot('api_key', apiKeyId)).toBe(true)
  })

  it('lets an account with an audited API key be deleted and keeps the audit row and key root', async () => {
    const { user, apiKeyId } = await createApiKeyOwner(true)

    await deleteUserAndDrainForTest(user, user)

    expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
      expect.objectContaining({ api_key_id: apiKeyId, oauth_client_id: null, outcome: 'accepted' }),
    ])
    await cleanupRetainedIdentityRoots(1_000, { api_key: [apiKeyId] })
    expect(await hasTestRetainedIdentityRoot('api_key', apiKeyId)).toBe(true)
  })

  it('reclaims the root of a deleted key that no audit row names', async () => {
    const { user, apiKeyId } = await createApiKeyOwner(false)

    await deleteUserAndDrainForTest(user, user)

    await cleanupRetainedIdentityRoots(1_000, { api_key: [apiKeyId] })
    expect(await hasTestRetainedIdentityRoot('api_key', apiKeyId)).toBe(false)
  })
})
