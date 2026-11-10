import { describe, expect, it } from 'vitest'
import { createTestUserDirect, WEB_PROVENANCE } from '@voucha/test-helpers'
import { resolveHostname } from '@services/topics/resolve-hostname'
import { createInstanceFromHostname } from '../fediverse-instances/create-instance.mts'
import { createInstanceWithRetry } from '../fediverse-instances/create-instance-helpers.mts'

describe('source creation after a hostname conflict', () => {
  it('returns null when a hostname already has an instance after a creation conflict', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-existing-race-${Math.random().toString(36).slice(2, 10)}.example.com`
    const created = await createInstanceFromHostname(user, WEB_PROVENANCE, hostname)
    expect(created.status).toBe('created')
    const hostnameId = await resolveHostname(user.id, hostname)
    expect(hostnameId).not.toBeNull()

    await expect(
      createInstanceWithRetry({
        provenance: WEB_PROVENANCE,
        currentUser: user,
        hostnameId: hostnameId!,
        hostname,
        attempt: 0,
        metadata: null,
      }),
    ).resolves.toBeNull()
  })
})
