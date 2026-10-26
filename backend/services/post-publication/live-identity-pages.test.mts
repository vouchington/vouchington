import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestTopic,
  createTestUser,
  insertTestCommunity,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createRssFeed } from '../rss-feeds/create.mts'
import { createTopicAliases } from '../topics/aliases.mts'
import {
  listLivePublicationIdentityNames,
  listLivePublicationScopeKeys,
  listLiveTopicAliasesPage,
} from './live-identity-pages.mts'

describe('live publication identity pages', () => {
  it('discovers current names and topic aliases after old keys were captured', async () => {
    const nonce = createRandomString(10)
    const user = await createTestUser()
    const topic = await createTestTopic({ hostname: `live-identity-${nonce}.example.com` })
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `live-identity-${nonce}`,
    })
    const [alias] = await createTopicAliases(topic.id, `live alias ${nonce}`)
    if (!alias || !user.username) throw new Error('Expected live identities')

    const names = await listLivePublicationIdentityNames({
      userIds: [user.id],
      communityIds: [community.id],
      topicIds: [topic.id],
    })
    expect(names.usernames).toContain(user.username)
    expect(names.communitySlugs).toContain(community.slug)
    expect(names.topicSlugs).toContain(topic.slug)
    const page = await listLiveTopicAliasesPage(topic.id, null)
    expect(page.aliases).toContain(alias.alias)
    expect(await listLivePublicationScopeKeys({ type: 'topic_alias', id: alias.id })).toEqual(
      expect.arrayContaining([
        { kind: 'identity_topic_alias', textValue: alias.alias },
        { kind: 'impact_topic', uuidValue: topic.id },
      ]),
    )
  })

  it('keeps a live feed topic and returns no current keys after a scope row is gone', async () => {
    const nonce = createRandomString(10)
    const topic = await createTestTopic({ hostname: `live-feed-${nonce}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://live-feed-${nonce}.example.com/feed.xml`,
      topic_id: topic.id,
      title: 'Live scope feed',
    })
    expect(await listLivePublicationScopeKeys({ type: 'rss_feed', id: feed.id })).toEqual([
      { kind: 'impact_topic', uuidValue: topic.id },
    ])
    expect(await listLivePublicationScopeKeys({ type: 'topic_alias', id: feed.id })).toEqual([])
    expect(await listLivePublicationScopeKeys({ type: 'other', id: feed.id })).toEqual([])
  })
})
