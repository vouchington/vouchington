import {
  sdkMergedSuccessNames,
  expectSdkSuccessNames,
} from '@voucha/test-helpers/mcp-sdk-success-names'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createStaffResolutionFixture } from '@voucha/test-helpers/staff-resolution-history'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import {
  sdkCatalogCases as cases,
  connectSdkCatalog,
  createSdkCatalogAssertions,
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
const callAndValidate = async (
  catalog: Awaited<ReturnType<typeof createSdkCatalogAssertions>>,
  name: string,
  option: string | null,
  args: Record<string, unknown>,
) => {
  const result = await catalog.callAndValidate(name, option, args)
  if (option !== null) observedMergedNames.add(name)
  return result
}

describe('registered catalog SDK', () => {
  afterAll(() => expectSdkSuccessNames(observedMergedNames, sdkMergedSuccessNames.simple))

  it.each([
    { testCase: cases[0]!, name: 'discover_communities', option: 'trending', args: {} },
    { testCase: cases[0]!, name: 'discover_topics', option: 'trending', args: {} },
    { testCase: cases[0]!, name: 'discover_rss_feeds', option: 'trending', args: {} },
    { testCase: cases[0]!, name: 'read_reference_data', option: 'countries', args: {} },
    { testCase: cases[0]!, name: 'read_rss_feed_item', option: 'list', args: {} },
    { testCase: cases[0]!, name: 'read_feed', option: 'posts', args: { feed_type: 'any' } },
    { testCase: cases[0]!, name: 'read_posts', option: 'trending', args: {} },
    { testCase: cases[0]!, name: 'read_hostnames', option: 'top', args: {} },
    { testCase: cases[0]!, name: 'read_my_review_disputes', option: 'list', args: {} },
    { testCase: cases[0]!, name: 'read_my_moderation_appeals', option: 'list', args: {} },
    { testCase: cases[0]!, name: 'read_my_lists', option: 'list', args: {} },
    { testCase: cases[0]!, name: 'read_my_profile', option: 'bio', args: {} },
    { testCase: cases[0]!, name: 'read_my_preferences', option: 'general', args: {} },
    { testCase: cases[0]!, name: 'read_my_notifications', option: 'list', args: {} },
    { testCase: cases[3]!, name: 'read_crawler', option: 'list', args: {} },
    { testCase: cases[3]!, name: 'read_report_integrity', option: 'flags', args: {} },
    { testCase: cases[3]!, name: 'read_report_integrity', option: 'penalties', args: {} },
    { testCase: cases[3]!, name: 'read_vote_integrity', option: 'flags', args: {} },
    { testCase: cases[3]!, name: 'read_vote_integrity', option: 'penalties', args: {} },
    { testCase: cases[3]!, name: 'read_moderation_appeal', option: 'list', args: {} },
    {
      testCase: cases[3]!,
      name: 'read_review_dispute',
      option: 'list',
      args: {},
      prepare: async () => {
        const fixture = await createStaffResolutionFixture('dispute', false)
        return async (
          catalog: Awaited<ReturnType<typeof createSdkCatalogAssertions>>,
          result: unknown,
        ) => {
          if (!fixture.postId || !fixture.postTitle)
            throw new Error('Expected an owned dispute post')
          expect(result).toMatchObject({
            disputes: expect.arrayContaining([
              expect.objectContaining({ id: fixture.id, status: 'pending' }),
            ]),
          })
          const detail = await callAndValidate(catalog, 'read_review_dispute', 'get', {
            id: fixture.id,
          })
          expect(detail).toMatchObject({
            dispute: {
              id: fixture.id,
              post_id: fixture.postId,
              status: 'pending',
              claim_text: expect.stringContaining('Test review dispute fixture.'),
              post_content: { text: expect.stringContaining(fixture.postTitle) },
              staff_context: {
                review: {
                  post: { id: fixture.postId, title: expect.stringContaining(fixture.postTitle) },
                },
              },
            },
          })
        }
      },
    },
    { testCase: cases[3]!, name: 'read_admin_metrics', option: 'growth', args: { range: 'today' } },
    { testCase: cases[3]!, name: 'read_queue_catalog', option: 'queues', args: {} },
    { testCase: cases[3]!, name: 'read_queue_catalog', option: 'scheduled_jobs', args: {} },
    { testCase: cases[3]!, name: 'read_queue_catalog', option: 'backfills', args: {} },
    { testCase: cases[3]!, name: 'read_dynamic_config', option: 'namespaces', args: {} },
    {
      testCase: cases[3]!,
      name: 'read_dynamic_config',
      option: 'namespace',
      args: { namespace: 'kagi-smallweb-config' },
    },
    {
      testCase: cases[3]!,
      name: 'read_dynamic_config',
      option: 'history',
      args: { namespace: 'kagi-smallweb-config' },
    },
    { testCase: cases[3]!, name: 'list_moderation_reports', option: null, args: {} },
    { testCase: cases[3]!, name: 'list_post_review_queue', option: null, args: {} },
    { testCase: cases[3]!, name: 'list_pending_topic_claims', option: null, args: {} },
  ])('calls $name ($option) and validates its advertised structured result', async row => {
    const assertOwned = await row.prepare?.()
    const client = await connect(row.testCase)
    try {
      const catalog = await createSdkCatalogAssertions(client)
      const result = await callAndValidate(catalog, row.name, row.option, row.args)
      expect(result).toBeDefined()
      await assertOwned?.(catalog, result)
    } finally {
      await client.close()
    }
  })

  it('validates nonempty staff appeal list schema and owned detail run identities', async () => {
    const fixture = await createStaffResolutionFixture('appeal', false)
    const client = await connect(cases[3]!)
    try {
      const catalog = await createSdkCatalogAssertions(client)
      const detail = await callAndValidate(catalog, 'read_moderation_appeal', 'get', {
        id: fixture.id,
      })
      expect(detail).toMatchObject({
        appeal: {
          id: fixture.id,
          ai_draft_requested_run_id: expect.stringMatching(/^appeal_resolution_/),
          ai_draft_run_id: null,
        },
      })
      const page = await callAndValidate(catalog, 'read_moderation_appeal', 'list', {})
      // Staff pages span the dirty database; only detail lookup is scoped to our owned row.
      expect(page).toMatchObject({ appeals: expect.any(Array) })
      expect((page as { appeals: unknown[] }).appeals.length).toBeGreaterThan(0)
    } finally {
      await client.close()
    }
  })

  it('searches only owned data points through the SDK', async () => {
    const owner = await createTestUser()
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `SDK data points ${suffix}`,
      slug: `sdk-data-points-${suffix}`,
      createdById: owner.id,
    })
    const postId = await insertTestDataPoint({
      title: `SDK data point ${suffix}`,
      slug: `sdk-data-point-${suffix}`,
      createdById: owner.id,
      topicId,
      result: 'approved',
    })
    const client = await connect(cases[0]!, owner)
    try {
      const catalog = await createSdkCatalogAssertions(client)
      const result = await callAndValidate(catalog, 'read_data_points', 'search', {
        topic_id: topicId,
      })
      expect(result).toMatchObject({
        success: true,
        results: [expect.objectContaining({ id: postId })],
      })
    } finally {
      await client.close()
    }
  })
})
