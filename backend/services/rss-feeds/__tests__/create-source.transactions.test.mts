import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, getTopicAliasIdForTest, WEB_PROVENANCE } from '@voucha/test-helpers'
import { getTopicBySlug } from '@services/topics/get'
import { createSourceWithRetry } from '../create-source-helpers.mts'

describe('RSS source creation transaction failures', () => {
  it('rolls back the topic and alias when its hostname reference does not exist', async () => {
    const user = await createTestUser()
    const id = randomUUID()
    const feedUrl = `https://missing-source-hostname-${id}.example.com/feed.xml`
    const slug = `missing-source-hostname-missing-source-hostname-${id}-example-com-feed-xml`

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
