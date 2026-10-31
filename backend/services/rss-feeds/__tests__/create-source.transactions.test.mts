import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, getTopicAliasIdForTest, WEB_PROVENANCE } from '@voucha/test-helpers'
import { getTopicBySlug } from '@services/topics/get'
import { createSourceWithRetry } from '../create-source-helpers.mts'
import { generateSourceDetails } from '../generate-source-details.mts'

describe('RSS source creation transaction failures', () => {
  it('rolls back the topic and alias when its hostname reference does not exist', async () => {
    const user = await createTestUser()
    const feedUrl = `https://missing-source-hostname-${randomUUID()}.example.com/feed.xml`
    const slug = generateSourceDetails(
      'Missing source hostname',
      'Missing source hostname',
      feedUrl,
      0,
    ).slug

    await expect(
      createSourceWithRetry({
        provenance: WEB_PROVENANCE,
        currentUser: user,
        rssFeedUrlId: randomUUID(),
        hostnameId: randomUUID(),
        feedUrl,
        topicName: 'Missing source hostname',
        rawTitle: 'Missing source hostname',
        feedTitle: null,
        feedType: 'article',
        attempt: 0,
      }),
    ).rejects.toMatchObject({ code: '23503' })
    expect(await getTopicBySlug(slug)).toBeNull()
    expect(await getTopicAliasIdForTest(slug)).toBeNull()
  })
})
