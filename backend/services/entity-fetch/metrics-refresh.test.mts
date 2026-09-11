import { describe, expect, it } from 'vitest'
import { caches } from '@services/entity-cache/caches'
import { createTestUser, pollUntilNotNull } from '@voucha/test-helpers'
import { refreshUserMetricsCache } from './metrics.mts'

describe('refreshUserMetricsCache', () => {
  it('sets metrics cache for user id and username', async () => {
    const testUser = await createTestUser({ administrator: true })
    await refreshUserMetricsCache(testUser!.id)

    const byId = (await pollUntilNotNull(() => caches.user_metrics.get(testUser!.id))) as Record<
      string,
      unknown
    >
    const byUsername = (await pollUntilNotNull(() =>
      caches.user_metrics.get(testUser!.username!),
    )) as Record<string, unknown>
    expect(byId).not.toBeNull()
    expect(byUsername).not.toBeNull()
    expect(byId.id).toBe(testUser!.id)
    expect(byUsername.id).toBe(testUser!.id)
  })

  it('rethrows when a key cannot be resolved to an id or username', async () => {
    await expect(refreshUserMetricsCache(12345)).rejects.toThrow('Invalid key: 12345')
  })
})
