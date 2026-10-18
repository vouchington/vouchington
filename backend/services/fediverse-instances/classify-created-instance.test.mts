import { describe, expect, it, vi } from 'vitest'
import { resolveHostname } from '@services/topics/hostname-link'
import { createTestUserDirect, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { classifyFediverseInstance } from '@services/fediverse-search/adapters/instance-classification'
import { classifyCreatedFediverseInstance } from './classify-created-instance.mts'
import { createInstanceFromHostname } from './create-instance.mts'

async function createInstance() {
  const user = await createTestUserDirect()
  const hostname = `fedi-classify-${Math.random().toString(36).slice(2, 10)}.example.com`
  const created = await createInstanceFromHostname(user, WEB_PROVENANCE, hostname)
  const hostnameId = await resolveHostname(user.id, hostname)
  return { topicId: created.topic_id, hostnameId: hostnameId! }
}

describe('classifyCreatedFediverseInstance', () => {
  it('throws on a provider failure so the queue retries the job', async () => {
    const { topicId, hostnameId } = await createInstance()
    const classify = vi
      .fn<typeof classifyFediverseInstance>()
      .mockResolvedValue({ status: 'error', error_code: 'provider_error' })
    await expect(classifyCreatedFediverseInstance(topicId, hostnameId, classify)).rejects.toThrow(
      'Fediverse instance classification failed',
    )
    expect(classify).toHaveBeenCalledTimes(1)
  })

  it('completes without retrying an unsupported host', async () => {
    const { topicId, hostnameId } = await createInstance()
    const classify = vi
      .fn<typeof classifyFediverseInstance>()
      .mockResolvedValue({ status: 'error', error_code: 'unsupported_host' })
    await expect(
      classifyCreatedFediverseInstance(topicId, hostnameId, classify),
    ).resolves.toBeUndefined()
  })
})
