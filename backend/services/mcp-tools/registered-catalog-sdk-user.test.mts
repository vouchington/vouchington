import {
  sdkMergedSuccessNames,
  expectSdkSuccessNames,
} from '@voucha/test-helpers/mcp-sdk-success-names'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  createRandomString,
  insertTestCommunity,
  insertTestList,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'
import {
  sdkCatalogCases as cases,
  connectSdkCatalog,
  callAndValidateSdkTool,
} from '@voucha/test-helpers/mcp-sdk-catalog'

async function connect(
  testCase: Parameters<typeof connectSdkCatalog>[0],
  account?: Parameters<typeof connectSdkCatalog>[1],
) {
  return connectSdkCatalog(testCase, account, async (url, fetch) => {
    const client = new Client({ name: 'voucha-registered-catalog-test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(url, { fetch }))
    return client
  })
}

const observedMergedNames = new Set<string>()
const callAndValidate: typeof callAndValidateSdkTool = async (client, name, option, args) => {
  const result = await callAndValidateSdkTool(client, name, option, args)
  if (option !== null) observedMergedNames.add(name)
  return result
}

describe('registered catalog SDK', () => {
  afterAll(() => expectSdkSuccessNames(observedMergedNames, sdkMergedSuccessNames.userFixture))

  it('reads owned community, topic, feed and user rows through four more merged tools', async () => {
    const client = await connect(cases[0]!)
    try {
      const owner = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id })
      const topic = await createTestTopic({ user: owner })
      const feed = await insertTestRssFeedDirect({ topicId: topic.id })
      expect(
        await callAndValidate(client, 'read_community', 'details', { community_id: community.id }),
      ).toMatchObject({ success: true })
      expect(
        await callAndValidate(client, 'read_topic', 'details', { topic_id: topic.id }),
      ).toMatchObject({ success: true })
      expect(
        await callAndValidate(client, 'read_rss_feed', 'details', { rss_feed_id: feed.id }),
      ).toMatchObject({ success: true })
      expect(
        await callAndValidate(client, 'read_users', 'details', { user_id: owner.id }),
      ).toMatchObject({ success: true })
    } finally {
      await client.close()
    }
  })

  it('writes profile, preferences, and notification state through three merged tools', async () => {
    const client = await connect(cases[0]!)
    try {
      expect(
        await callAndValidate(client, 'edit_my_profile', 'bio', {
          markdown: 'SDK catalog round trip',
        }),
      ).toMatchObject({ success: true })
      expect(
        await callAndValidate(client, 'edit_my_preferences', 'email', {
          news_digest_frequency: 'weekly',
        }),
      ).toMatchObject({ success: true })
      expect(await callAndValidate(client, 'mark_notifications_read', 'all', {})).toMatchObject({
        success: true,
      })
    } finally {
      await client.close()
    }
  })

  it('removes an owned list and referral link and saves a topic bookmark', async () => {
    const owner = await createTestUser()
    const client = await connect(cases[0]!, owner)
    try {
      const list = await insertTestList({
        ownerUserId: owner.id,
        name: `SDK ${createRandomString(8)}`,
      })
      expect(
        await callAndValidate(client, 'remove_list_content', 'list', { list_id: list.id }),
      ).toMatchObject({ success: true })

      const program = await createReferralProgramFixture({ createdById: owner.id })
      const created = await client.callTool({
        name: 'create_referral_link',
        arguments: {
          referral_program_id: program.referralProgramId,
          url: `https://${program.hostname}/ref/${createRandomString(8)}`,
        },
      })
      if (created.isError)
        throw new Error(`create_referral_link failed: ${JSON.stringify(created.content)}`)
      const link = (created.structuredContent as { referral_link: { id: string } }).referral_link
      expect(
        await callAndValidate(client, 'remove_referral_link', 'link', { link_id: link.id }),
      ).toMatchObject({ success: true })

      const topic = await createTestTopic({ user: owner })
      expect(
        await callAndValidate(client, 'manage_bookmark', 'set', {
          predicate: 'follow',
          targets: [{ entity_type: 'topic', entity: topic.id }],
        }),
      ).toMatchObject({ success: true })
    } finally {
      await client.close()
    }
  })
})
