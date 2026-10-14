import {
  sdkMergedSuccessNames,
  expectSdkSuccessNames,
} from '@voucha/test-helpers/mcp-sdk-success-names'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestVoteIntegrityFlag,
  insertTestReportIntegrityFlag,
  insertTestReportAbusePenalty,
  createTestAgent,
  insertTestAgentPrompt,
  insertTestAgentModeration,
} from '@voucha/test-helpers'
import { createStaffResolutionFixture } from '@voucha/test-helpers/staff-resolution-history'
import { insertTestStory } from '@voucha/test-helpers/entities/stories'
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
  afterAll(() => expectSdkSuccessNames(observedMergedNames, sdkMergedSuccessNames.adminFixture))

  it('reads an owned editorial story through the singular SDK tool', async () => {
    const client = await connect(cases[3]!)
    try {
      const story = await insertTestStory({ title: `SDK story ${crypto.randomUUID()}` })
      expect(
        await callAndValidate(client, 'get_editorial_story', null, {
          story_id: story.id,
        }),
      ).toMatchObject({ story: { id: story.id } })
    } finally {
      await client.close()
    }
  })

  it('reads an imported editorial job and records an RSS category rejection', async () => {
    const client = await connect(cases[3]!)
    try {
      const slug = `sdk-${crypto.randomUUID()}`
      const imported = await client.callTool({
        name: 'import_topics',
        arguments: { csv: `slug,name\n${slug},SDK acceptance topic` },
      })
      expect(imported.isError).toBeUndefined()
      const batch = (imported.structuredContent as { batch: { id: string } }).batch
      expect(
        await callAndValidate(client, 'read_editorial_job', 'import_batch', { batch_id: batch.id }),
      ).toMatchObject({ batch: { id: batch.id } })
      expect(
        await callAndValidate(client, 'set_rss_category_rejection', 'reject', {
          category_text: `sdk-${crypto.randomUUID()}`,
        }),
      ).toBeDefined()
    } finally {
      await client.close()
    }
  })

  it('reads and records user moderation, vote weight, and suspension through admin options', async () => {
    const client = await connect(cases[3]!)
    try {
      const target = await createTestUser()
      expect(
        await callAndValidate(client, 'read_user_moderation', 'warnings', {
          userId: target.id,
        }),
      ).toBeDefined()
      expect(
        await callAndValidate(client, 'read_user_moderation', 'context', { userId: target.id }),
      ).toBeDefined()
      expect(
        await callAndValidate(client, 'record_user_moderation', 'note', {
          userId: target.id,
          body: 'SDK acceptance note',
        }),
      ).toBeDefined()
      expect(
        await callAndValidate(client, 'configure_user_vote_weight', 'set', {
          userId: target.id,
          weight: 7,
        }),
      ).toMatchObject({ success: true })
      expect(
        await callAndValidate(client, 'set_user_suspension', 'suspend', { userId: target.id }),
      ).toBeDefined()
    } finally {
      await client.close()
    }
  })

  it('reviews integrity flags and applies and lifts an owned penalty', async () => {
    const client = await connect(cases[3]!)
    try {
      const author = await createTestUser()
      const reporter = await createTestUser()
      const postId = await insertTestPost({
        createdById: author.id,
        title: `SDK integrity ${crypto.randomUUID()}`,
        slug: `sdk-integrity-${crypto.randomUUID()}`,
        markdown: 'Flag fixture',
      })
      const voteFlagId = await insertTestVoteIntegrityFlag({ postId })
      expect(
        await callAndValidate(client, 'review_integrity_flag', 'vote', {
          id: voteFlagId,
          resolution: 'dismissed',
        }),
      ).toBeDefined()

      const reportFlagId = await insertTestReportIntegrityFlag({
        reportedUserId: author.id,
        reporterUserIds: [reporter.id],
      })
      expect(
        await callAndValidate(client, 'apply_integrity_penalty', 'report_abuse', {
          id: reportFlagId,
        }),
      ).toBeDefined()

      const admin = await createTestUser({ administrator: true })
      const penaltyId = await insertTestReportAbusePenalty({
        userId: reporter.id,
        createdById: admin.id,
      })
      expect(
        await callAndValidate(client, 'lift_integrity_penalty', 'report_abuse', {
          id: penaltyId,
        }),
      ).toBeDefined()
    } finally {
      await client.close()
    }
  })

  it('sets an agent moderation vote on a real moderation record', async () => {
    const client = await connect(cases[3]!)
    try {
      const author = await createTestUser()
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
      const postId = await insertTestPost({
        createdById: author.id,
        title: `SDK agent vote ${crypto.randomUUID()}`,
        slug: `sdk-agent-vote-${crypto.randomUUID()}`,
        markdown: 'Moderation fixture',
      })
      const id = await insertTestAgentModeration({ postId, promptId, agentId: agent.id })
      expect(
        await callAndValidate(client, 'configure_agent_moderation_vote', 'set', {
          id,
          choice: 'accurate',
        }),
      ).toBeDefined()
    } finally {
      await client.close()
    }
  })

  it('drafts, approves, delivers, and resolves an appeal through four admin options', async () => {
    const client = await connect(cases[3]!)
    try {
      const { id } = await createStaffResolutionFixture('appeal', false)
      expect(
        await callAndValidate(client, 'draft_review_response', 'appeal', {
          id,
          public_response: 'Reviewed through the SDK',
          internal_notes: 'Acceptance fixture',
        }),
      ).toBeDefined()
      expect(
        await callAndValidate(client, 'approve_review_response', 'appeal', { id }),
      ).toBeDefined()
      expect(
        await callAndValidate(client, 'deliver_review_response', 'appeal', { id }),
      ).toBeDefined()
      expect(
        await callAndValidate(client, 'resolve_review_case', 'appeal', {
          id,
          action: 'deny',
        }),
      ).toBeDefined()
    } finally {
      await client.close()
    }
  })

  it('reruns a pending appeal resolution draft through the SDK', async () => {
    const client = await connect(cases[3]!)
    try {
      const { id } = await createStaffResolutionFixture('appeal', false)
      expect(
        await callAndValidate(client, 'rerun_review_resolution_draft', 'appeal', { id }),
      ).toBeDefined()
    } finally {
      await client.close()
    }
  })
})
