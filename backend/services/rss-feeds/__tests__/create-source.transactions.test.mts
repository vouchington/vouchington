import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, getTopicAliasIdForTest, WEB_PROVENANCE } from '@voucha/test-helpers'
import { getTopicBySlug } from '@services/topics/get'
import { createRssFeedSource } from '../create-source-helpers.mts'

describe('RSS source creation transaction failures', () => {
  it('rolls back the topic and alias when its hostname reference does not exist', async () => {
    const user = await createTestUser()
    const slug = `missing-source-hostname-${randomUUID()}`

    await expect(
      createRssFeedSource({
        provenance: WEB_PROVENANCE,
        createdById: user.id,
        rssFeedUrlId: randomUUID(),
        hostnameId: randomUUID(),
        topicName: 'Missing source hostname',
        slug,
        feedTitle: null,
        feedType: 'article',
      }),
    ).rejects.toMatchObject({ code: '23503' })
    expect(await getTopicBySlug(slug)).toBeNull()
    expect(await getTopicAliasIdForTest(slug)).toBeNull()
  })
})
