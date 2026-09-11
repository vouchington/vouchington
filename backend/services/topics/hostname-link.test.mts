import { expect, it, describe } from 'vitest'
import {
  createTestUser,
  getUrlHostnameTopicId,
  insertTestTopic,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { linkHostnameToSourceTopic, setTopicHostnameLink } from './hostname-link.mts'
import { getTopicByAny } from './get.mts'

describe('hostname-link', () => {
  it('setTopicHostnameLink links topic and hostname in both directions', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Hostname Topic ${random}`,
      slug: `hostname-topic-${random}`,
      createdById: user!.id,
    })
    const hostnameId = await insertTestUrlHostname({
      hostname: `topic-link-${random}.example.com`,
    })
    await setTopicHostnameLink(topicId, hostnameId)

    const topic = await getTopicByAny(topicId)
    const hostnameTopicId = await getUrlHostnameTopicId(hostnameId)

    expect(topic?.hostname_id).toBe(hostnameId)
    expect(hostnameTopicId).toBe(topicId)
  })

  it('setTopicHostnameLink rejects linking a hostname that belongs to another topic', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const firstTopicId = await insertTestTopic({
      name: `First Hostname Topic ${random}`,
      slug: `first-hostname-topic-${random}`,
      createdById: user!.id,
    })
    const secondTopicId = await insertTestTopic({
      name: `Second Hostname Topic ${random}`,
      slug: `second-hostname-topic-${random}`,
      createdById: user!.id,
    })
    const hostnameId = await insertTestUrlHostname({
      hostname: `topic-conflict-${random}.example.com`,
    })
    await setTopicHostnameLink(firstTopicId, hostnameId)

    await expect(setTopicHostnameLink(secondTopicId, hostnameId)).rejects.toThrow(
      'Hostname is already linked to another topic',
    )
  })

  it('linkHostnameToSourceTopic sets topics.hostname_id but does not claim url_hostnames.topic_id', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Source Topic ${random}`,
      slug: `source-topic-${random}`,
      createdById: user!.id,
      topicType: 'rss_feed',
    })
    const hostnameId = await insertTestUrlHostname({
      hostname: `source-link-${random}.example.com`,
    })
    await linkHostnameToSourceTopic(topicId, hostnameId)

    const topic = await getTopicByAny(topicId)
    const hostnameTopicId = await getUrlHostnameTopicId(hostnameId)

    expect(topic?.hostname_id).toBe(hostnameId)
    expect(hostnameTopicId).toBeNull()
  })

  it('linkHostnameToSourceTopic clears a legacy claim from the previous hostname', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Source Topic Move ${random}`,
      slug: `source-topic-move-${random}`,
      createdById: user!.id,
      topicType: 'rss_feed',
    })
    const oldHostnameId = await insertTestUrlHostname({
      hostname: `source-old-${random}.example.com`,
    })
    const newHostnameId = await insertTestUrlHostname({
      hostname: `source-new-${random}.example.com`,
    })
    await setTopicHostnameLink(topicId, oldHostnameId)

    await linkHostnameToSourceTopic(topicId, newHostnameId)

    const topic = await getTopicByAny(topicId)
    expect(topic?.hostname_id).toBe(newHostnameId)
    expect(await getUrlHostnameTopicId(oldHostnameId)).toBeNull()
    expect(await getUrlHostnameTopicId(newHostnameId)).toBeNull()
  })

  it('linkHostnameToSourceTopic preserves another topic claim on the previous hostname', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const domainTopicId = await insertTestTopic({
      name: `Domain Topic ${random}`,
      slug: `domain-topic-${random}`,
      createdById: user!.id,
    })
    const sourceTopicId = await insertTestTopic({
      name: `Source Topic Domain Move ${random}`,
      slug: `source-topic-domain-move-${random}`,
      createdById: user!.id,
      topicType: 'rss_feed',
    })
    const oldHostnameId = await insertTestUrlHostname({
      hostname: `source-domain-old-${random}.example.com`,
    })
    const newHostnameId = await insertTestUrlHostname({
      hostname: `source-domain-new-${random}.example.com`,
    })
    await setTopicHostnameLink(domainTopicId, oldHostnameId)
    await linkHostnameToSourceTopic(sourceTopicId, oldHostnameId)

    await linkHostnameToSourceTopic(sourceTopicId, newHostnameId)

    const topic = await getTopicByAny(sourceTopicId)
    expect(topic?.hostname_id).toBe(newHostnameId)
    expect(await getUrlHostnameTopicId(oldHostnameId)).toBe(domainTopicId)
    expect(await getUrlHostnameTopicId(newHostnameId)).toBeNull()
  })
})
