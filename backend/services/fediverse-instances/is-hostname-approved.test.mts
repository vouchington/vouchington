import { describe, it, expect } from 'vitest'
import { isFediverseInstanceApprovedByHostname } from './is-hostname-approved.mts'
import {
  createTestUserDirect,
  insertTestUrlHostname,
  insertTestTopic,
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
} from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

async function createInstanceTopicForHostname(
  hostname: string,
  integrationStatus?: 'pending' | 'approved' | 'blocked',
) {
  const user = await createTestUserDirect()
  const hostnameId = await insertTestUrlHostname({ hostname })
  const suffix = randomSuffix()
  const topicId = await insertTestTopic({
    name: `Allowlist Topic ${suffix}`,
    slug: `allowlist-topic-${suffix}`,
    createdById: user.id,
    topicType: 'fediverse_instance',
    hostnameId,
  })
  await insertTestFediverseInstanceExtension({ topicId, software: 'mastodon' })
  if (integrationStatus) {
    await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus })
  }
  return topicId
}

describe('isFediverseInstanceApprovedByHostname', () => {
  it('returns false when no url_hostname exists for the hostname', async () => {
    const hostname = `unknown-${randomSuffix()}.example`
    expect(await isFediverseInstanceApprovedByHostname(hostname)).toBe(false)
  })

  it('returns false when the hostname has no fediverse_instance topic', async () => {
    const hostname = `bare-${randomSuffix()}.example`
    await insertTestUrlHostname({ hostname })
    expect(await isFediverseInstanceApprovedByHostname(hostname)).toBe(false)
  })

  it('returns false when the instance is still pending', async () => {
    const hostname = `pending-${randomSuffix()}.example`
    await createInstanceTopicForHostname(hostname)
    expect(await isFediverseInstanceApprovedByHostname(hostname)).toBe(false)
  })

  it('returns false when the instance is blocked', async () => {
    const hostname = `blocked-${randomSuffix()}.example`
    await createInstanceTopicForHostname(hostname, 'blocked')
    expect(await isFediverseInstanceApprovedByHostname(hostname)).toBe(false)
  })

  it('returns true when the instance is approved', async () => {
    const hostname = `approved-${randomSuffix()}.example`
    await createInstanceTopicForHostname(hostname, 'approved')
    expect(await isFediverseInstanceApprovedByHostname(hostname)).toBe(true)
  })
})
