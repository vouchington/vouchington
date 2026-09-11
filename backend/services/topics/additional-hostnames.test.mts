import { it, expect, beforeAll, describe } from 'vitest'
import {
  getAdditionalHostnames,
  addAdditionalHostname,
  removeAdditionalHostname,
} from './additional-hostnames.mts'
import { getTopicByAny } from './get.mts'
import {
  createTestUser,
  createTestTopic,
  softDeleteTopic,
  mergeTopicForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('additional-hostnames', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })

  it('getAdditionalHostnames returns empty array for topic with no additional hostnames', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `primary-${random}.example.com` })
    const { results } = await getAdditionalHostnames(topic.id)
    expect(results).toEqual([])
  })

  it('addAdditionalHostname adds a hostname and getAdditionalHostnames returns it', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `add-primary-${random}.example.com` })
    const additionalHostname = `add-extra-${random}.example.com`

    const added = await addAdditionalHostname(topic.id, additionalHostname, user.id)
    expect(added.hostname).toBe(additionalHostname)
    expect(added.topic_id).toBe(topic.id)
    expect(added.hostname_id).toBeDefined()
    expect(added.created_at).toBeInstanceOf(Date)

    const { results: list } = await getAdditionalHostnames(topic.id)
    expect(list).toHaveLength(1)
    expect(list[0]!.hostname).toBe(additionalHostname)
  })

  it('getAdditionalHostnames excludes the primary hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const primaryHostname = `primary-excl-${random}.example.com`
    const topic = await createTestTopic({ hostname: primaryHostname })
    const additionalHostname = `extra-excl-${random}.example.com`

    await addAdditionalHostname(topic.id, additionalHostname, user.id)

    const { results: list } = await getAdditionalHostnames(topic.id)
    expect(list.find(h => h.hostname === primaryHostname)).toBeUndefined()
    expect(list.find(h => h.hostname === additionalHostname)).toBeDefined()
  })

  it('addAdditionalHostname is idempotent', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `idem-primary-${random}.example.com` })
    const additionalHostname = `idem-extra-${random}.example.com`

    await addAdditionalHostname(topic.id, additionalHostname, user.id)
    // Adding the same hostname again should not throw
    await addAdditionalHostname(topic.id, additionalHostname, user.id)

    const { results: list } = await getAdditionalHostnames(topic.id)
    const matches = list.filter(h => h.hostname === additionalHostname)
    expect(matches).toHaveLength(1)
  })

  it('removeAdditionalHostname removes an existing additional hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `remove-primary-${random}.example.com` })
    const additionalHostname = `remove-extra-${random}.example.com`

    const added = await addAdditionalHostname(topic.id, additionalHostname, user.id)
    await removeAdditionalHostname(topic.id, added.hostname_id)

    const { results: list } = await getAdditionalHostnames(topic.id)
    expect(list.find(h => h.hostname_id === added.hostname_id)).toBeUndefined()
  })

  it('removeAdditionalHostname throws 404 when hostname not linked to this topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `notlinked-${random}.example.com` })
    const fakeHostnameId = '00000000-0000-0000-0000-000000000001'

    await expect(removeAdditionalHostname(topic.id, fakeHostnameId)).rejects.toThrow(
      'Additional hostname not found for this topic',
    )
  })

  it('removeAdditionalHostname throws 404 when attempting to remove the primary hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const { id } = await createTestTopic({ hostname: `rm-primary-${random}.example.com` })
    const topic = await getTopicByAny(id)
    if (!topic?.hostname_id) throw new Error('Topic should have a hostname_id')

    // The primary hostname is managed via updateTopic, not removeAdditionalHostname
    await expect(removeAdditionalHostname(topic.id, topic.hostname_id)).rejects.toThrow(
      'Additional hostname not found for this topic',
    )
  })

  it('addAdditionalHostname throws 409 when hostname is primary for another topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const primaryHost = `conflict-primary-${random}.example.com`
    const topic1 = await createTestTopic({ hostname: primaryHost })
    const topic2 = await createTestTopic({ hostname: `other-primary-${random}.example.com` })

    await expect(addAdditionalHostname(topic2.id, primaryHost, user.id)).rejects.toThrow(
      'Hostname is already the primary hostname for another topic',
    )
    void topic1
  })

  it('addAdditionalHostname throws 409 when hostname is already an additional for another topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTestTopic({ hostname: `t1-${random}.example.com` })
    const topic2 = await createTestTopic({ hostname: `t2-${random}.example.com` })
    const sharedHostname = `shared-${random}.example.com`

    await addAdditionalHostname(topic1.id, sharedHostname, user.id)

    await expect(addAdditionalHostname(topic2.id, sharedHostname, user.id)).rejects.toThrow(
      'Hostname is already linked to another topic',
    )
  })

  it('addAdditionalHostname reclaims a stale claim from a soft-deleted topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const staleTopic = await createTestTopic({ hostname: `stale-primary-${random}.example.com` })
    const hostname = `stale-extra-${random}.example.com`
    await addAdditionalHostname(staleTopic.id, hostname, user.id)
    await softDeleteTopic(staleTopic.id, user.id)

    const newTopic = await createTestTopic({ hostname: `stale-new-${random}.example.com` })
    const reclaimed = await addAdditionalHostname(newTopic.id, hostname, user.id)

    expect(reclaimed.topic_id).toBe(newTopic.id)
    const { results: list } = await getAdditionalHostnames(newTopic.id)
    expect(list.find(h => h.hostname === hostname)).toBeDefined()
  })

  it('addAdditionalHostname reclaims a stale claim from a merged-away topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const mergedSource = await createTestTopic({ hostname: `merged-primary-${random}.example.com` })
    const destination = await createTestTopic({
      hostname: `merged-dest-primary-${random}.example.com`,
    })
    const hostname = `merged-extra-${random}.example.com`
    await addAdditionalHostname(mergedSource.id, hostname, user.id)
    await mergeTopicForTest(mergedSource.id, destination.id, user.id)

    const newTopic = await createTestTopic({ hostname: `merged-new-${random}.example.com` })
    const reclaimed = await addAdditionalHostname(newTopic.id, hostname, user.id)

    expect(reclaimed.topic_id).toBe(newTopic.id)
  })
})
