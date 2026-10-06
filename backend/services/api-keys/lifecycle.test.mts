import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, withFailingTransactionQueryOptionsForTest } from '@voucha/test-helpers'
import {
  setTestApiKeyExpiry,
  getTestApiKeyLifecycle,
  countTestApiKeysForUser,
} from '@voucha/test-helpers/entities/api-keys'
import { addUserRole } from '../users/roles-permissions.mts'
import { deleteUser } from '../users/delete.mts'
import { processUserDeletionCredentialsBatch } from '../users/delete-phase-credentials.mts'
import { createApiKey } from './create.mts'
import { rotateApiKey } from './rotate.mts'
import { validateApiKey, validateApiKeyForUserMcp } from './validate.mts'
import { revokeApiKey } from './revoke.mts'
import { claimApiKeyExpiryReminder, getApiKeysDueForExpiryReminder } from './expiry-reminders.mts'

describe('API key lifetime and rotation', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'synthetic API key checksum secret for lifecycle tests'
  })

  it('defaults ordinary keys to 90 days and administrator keys to 30', async () => {
    for (const administrator of [false, true]) {
      const user = await createTestUser({ administrator })
      const { apiKey } = await createApiKey(user.id, 'rss', 'Default lifetime', ['rss:read'])
      const row = await getTestApiKeyLifecycle(apiKey.id)
      expect(Number(row.lifetime_seconds)).toBeCloseTo((administrator ? 30 : 90) * 86400, -1)
    }
  })

  it.each([null, 365] as const)('rejects administrator lifetime %s', async lifetime => {
    const user = await createTestUser({ administrator: true })
    await expect(
      createApiKey(user.id, 'rss', 'Invalid', ['rss:read'], lifetime),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('accepts the exact administrator maximum before and after rotation', async () => {
    const user = await createTestUser({ administrator: true })
    const old = await createApiKey(user.id, 'mcp', 'Maximum lifetime', ['mcp.user:read'], 90)
    expect((await validateApiKeyForUserMcp(old.rawKey)).valid).toBe(true)
    const replacement = await rotateApiKey(user.id, old.apiKey.id)
    expect((await validateApiKeyForUserMcp(replacement.rawKey)).valid).toBe(true)
    expect(Number((await getTestApiKeyLifecycle(replacement.apiKey.id)).lifetime_seconds)).toBe(
      90 * 86400,
    )
  })

  it.each(['rss', 'mcp'] as const)(
    'rejects expired %s keys exactly like revoked keys',
    async type => {
      const user = await createTestUser()
      const permission = type === 'rss' ? 'rss:read' : 'mcp.user:read'
      const expired = await createApiKey(user.id, type, 'Expired', [permission])
      const revoked = await createApiKey(user.id, type, 'Revoked', [permission])
      await setTestApiKeyExpiry(expired.apiKey.id, new Date(Date.now() - 1000))
      await revokeApiKey(user.id, revoked.apiKey.id)
      expect(await validateApiKey(expired.rawKey, permission)).toEqual({ valid: false })
      expect(await validateApiKey(revoked.rawKey, permission)).toEqual({ valid: false })
      expect(await validateApiKeyForUserMcp(expired.rawKey)).toEqual({ valid: false })
      expect((await getTestApiKeyLifecycle(expired.apiKey.id)).last_used_at).toBeNull()
    },
  )

  it.each([null, 365] as const)(
    'rejects newly promoted administrator lifetime %s and repairs rotation',
    async days => {
      const user = await createTestUser()
      const old = await createApiKey(user.id, 'mcp', 'Promoted', ['mcp.user:read'], days)
      expect((await validateApiKeyForUserMcp(old.rawKey)).valid).toBe(true)
      await addUserRole(user.id, 'administrator')
      expect(await validateApiKeyForUserMcp(old.rawKey)).toEqual({ valid: false })
      const replacement = await rotateApiKey(user.id, old.apiKey.id)
      expect((await validateApiKeyForUserMcp(replacement.rawKey)).valid).toBe(true)
      expect(
        Number((await getTestApiKeyLifecycle(replacement.apiKey.id)).lifetime_seconds),
      ).toBeCloseTo(30 * 86400, -1)
    },
  )

  it('preserves owner, label, permissions and lifetime with 24-hour overlap', async () => {
    const user = await createTestUser()
    const old = await createApiKey(user.id, 'rss', 'Feed reader', ['rss:read'], 30)
    const before = Date.now()
    const replacement = await rotateApiKey(user.id, old.apiKey.id)
    expect(replacement.apiKey).toMatchObject({
      user_id: user.id,
      label: 'Feed reader',
      permissions: ['rss:read'],
      type: 'rss',
    })
    const row = await getTestApiKeyLifecycle(old.apiKey.id)
    expect(row.replaced_by_api_key_id).toBe(replacement.apiKey.id)
    expect(new Date(row.expires_at).getTime() - before).toBeGreaterThan(23 * 3600000)
    expect(new Date(row.expires_at).getTime() - before).toBeLessThanOrEqual(24 * 3600000 + 1000)
    expect((await validateApiKey(old.rawKey, 'rss:read')).valid).toBe(true)
    expect((await validateApiKey(replacement.rawKey, 'rss:read')).valid).toBe(true)
    await expect(rotateApiKey(user.id, old.apiKey.id)).rejects.toMatchObject({ status: 409 })
    await expect(rotateApiKey(user.id, replacement.apiKey.id)).resolves.toBeDefined()
  })

  it('never extends a sooner deadline and keeps no-expiry replacements unlimited', async () => {
    const user = await createTestUser()
    const old = await createApiKey(user.id, 'rss', 'Soon', ['rss:read'], null)
    const unlimited = await rotateApiKey(user.id, old.apiKey.id)
    expect(unlimited.apiKey.expires_at).toBeNull()
    const soon = new Date(Date.now() + 3600000)
    await setTestApiKeyExpiry(unlimited.apiKey.id, soon)
    await rotateApiKey(user.id, unlimited.apiKey.id)
    expect((await getTestApiKeyLifecycle(unlimited.apiKey.id)).expires_at).toEqual(soon)
  })

  it('permits only one concurrent replacement and hides other owners keys', async () => {
    const user = await createTestUser()
    const stranger = await createTestUser()
    const old = await createApiKey(user.id, 'rss', 'Concurrent', ['rss:read'])
    await expect(rotateApiKey(stranger.id, old.apiKey.id)).rejects.toMatchObject({ status: 404 })
    const results = await Promise.allSettled([
      rotateApiKey(user.id, old.apiKey.id),
      rotateApiKey(user.id, old.apiKey.id),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  })

  it('rolls back the replacement insert when linking the old row fails', async () => {
    const user = await createTestUser()
    const old = await createApiKey(user.id, 'rss', 'Atomic failure', ['rss:read'])
    const original = await getTestApiKeyLifecycle(old.apiKey.id)
    await expect(
      withFailingTransactionQueryOptionsForTest('linkRotatedApiKey', options =>
        rotateApiKey(user.id, old.apiKey.id, options),
      ),
    ).rejects.toBeInstanceOf(Error)
    expect(await countTestApiKeysForUser(user.id)).toBe(1)
    expect(await getTestApiKeyLifecycle(old.apiKey.id)).toEqual(original)
    expect((await validateApiKey(old.rawKey, 'rss:read')).valid).toBe(true)
  })

  it('deletes both old and replacement keys with their owner', async () => {
    const user = await createTestUser()
    const old = await createApiKey(user.id, 'rss', 'Deleted owner', ['rss:read'])
    const replacement = await rotateApiKey(user.id, old.apiKey.id)
    await deleteUser(user, user)
    for (let batch = 0; batch < 20; batch++) {
      if (!(await processUserDeletionCredentialsBatch(user.id, 100)).hasMore) break
    }
    expect(await countTestApiKeysForUser(user.id)).toBe(0)
    expect(await validateApiKey(old.rawKey, 'rss:read')).toEqual({ valid: false })
    expect(await validateApiKey(replacement.rawKey, 'rss:read')).toEqual({ valid: false })
  })

  it('claims an eligible reminder once under concurrent retries and excludes revoked/replaced keys', async () => {
    const user = await createTestUser()
    const due = await createApiKey(user.id, 'rss', 'Due', ['rss:read'])
    await setTestApiKeyExpiry(due.apiKey.id, new Date(Date.now() + 6 * 86400000))
    let dueIds = await getApiKeysDueForExpiryReminder()
    while (dueIds.length > 0 && !dueIds.includes(due.apiKey.id)) {
      dueIds = await getApiKeysDueForExpiryReminder(dueIds.at(-1))
    }
    expect(dueIds).toContain(due.apiKey.id)
    expect(
      (
        await Promise.all([
          claimApiKeyExpiryReminder(due.apiKey.id),
          claimApiKeyExpiryReminder(due.apiKey.id),
        ])
      ).filter(Boolean),
    ).toHaveLength(1)
    expect(await claimApiKeyExpiryReminder(due.apiKey.id)).toBe(false)
    const revoked = await createApiKey(user.id, 'rss', 'Revoked', ['rss:read'])
    await setTestApiKeyExpiry(revoked.apiKey.id, new Date(Date.now() + 6 * 86400000))
    await revokeApiKey(user.id, revoked.apiKey.id)
    expect(await claimApiKeyExpiryReminder(revoked.apiKey.id)).toBe(false)
    const replaced = await createApiKey(user.id, 'rss', 'Replaced', ['rss:read'])
    await rotateApiKey(user.id, replaced.apiKey.id)
    expect(await claimApiKeyExpiryReminder(replaced.apiKey.id)).toBe(false)
  })
})
