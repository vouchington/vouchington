import { describe, expect, it } from 'vitest'
import { createSourceWithRetry, generateSourceDetails } from '../create-source-helpers.mts'
import { createRssFeedUrlId } from '../rss-feed-url-id.mts'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { createTopicAliases } from '@services/topics/aliases'
import { getTopicAliases } from '@services/topics/get-topic-aliases'
import { createTestUserDirect, insertTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

async function makeSourceArgs(hostname: string, feedUrl: string) {
  const hostnameMap = await upsertUrlHostnames(null, [hostname])
  const hostnameId = hostnameMap.get(new URL(`https://${hostname}`).hostname)!
  const rssFeedUrlId = await createRssFeedUrlId(feedUrl)
  return { hostnameId, rssFeedUrlId }
}

describe('createSourceWithRetry', () => {
  it('creates a source via the user path (createdById non-null)', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-retry-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(hostname, feedUrl)
    const user = await createTestUserDirect()

    const result = await createSourceWithRetry({
      provenance: WEB_PROVENANCE,
      currentUser: user!,
      rssFeedUrlId,
      hostnameId,
      feedUrl,
      topicName: hostname,
      rawTitle: hostname,
      feedTitle: hostname,
      feedType: 'article',
      attempt: 0,
    })

    expect(result).not.toBeNull()
    expect(result!.slug).toMatch(/^rss-retry/)
    expect(result!.name).toBe(hostname)
  })

  it('retries when an unrelated active topic owns the generated canonical alias', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const hostname = `rss-alias-retry-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(hostname, feedUrl)
    const { slug: claimedAlias } = generateSourceDetails(hostname, hostname, feedUrl, 0)
    const ownerTopicId = await insertTestTopic({
      name: `RSS alias owner ${suffix}`,
      slug: `rss-alias-owner-${suffix}`,
      createdById: user.id,
    })
    await createTopicAliases(ownerTopicId, claimedAlias)

    const result = await createSourceWithRetry({
      provenance: WEB_PROVENANCE,
      currentUser: user,
      rssFeedUrlId,
      hostnameId,
      feedUrl,
      topicName: hostname,
      rawTitle: hostname,
      feedTitle: hostname,
      feedType: 'article',
      attempt: 0,
    })

    expect(result).not.toBeNull()
    expect(result!.slug).not.toBe(claimedAlias)
    expect(result!.slug).toMatch(new RegExp(`^${claimedAlias}-[0-9a-f]{4}$`))
    await expect(getTopicAliases(result!.topicId)).resolves.toMatchObject({
      results: expect.arrayContaining([result!.slug]),
    })
  })
})
