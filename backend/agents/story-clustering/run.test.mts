import { it, expect, vi, beforeAll, beforeEach, describe } from 'vitest'
import { callOpenAIClusteringAgent as callOpenAIClusteringAgentImpl } from './openai-clustering-agent.mts'
import { runStoryClusteringAgent } from './run.mts'
import type { StoryClusterCandidateRow as CandidateRow } from '@voucha/types/entities/story'
import {
  insertTestRssFeedItem,
  createRandomString,
  findAiUsageRecordForAgent,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { addUrl } from '@services/urls/upsert'
import { upsertSystemAdministrator } from '@services/users/system-users'
import type { Response } from 'openai/resources/responses/responses'
import type { OpenAIResponse } from '@modules/openai-utils/create-response'
import { OpenAIResponseNotCompletedError } from '@agents/_shared'

let testRssFeedId: string
let newItemId: string
let candidateItemId: string
let candidateItemIds: string[]

describe('run', () => {
  beforeAll(async () => {
    // Ensure the story-teller system user exists
    await upsertSystemAdministrator('story-teller')

    // Create test feed and items
    const feed = await createTestRssFeed({})
    testRssFeedId = feed.id

    const suffix = createRandomString(12)

    const newItemUrl = await addUrl(null, `https://cluster-agent-test-new-${suffix}.example.com`)
    newItemId = await insertTestRssFeedItem({
      rssFeedId: testRssFeedId,
      urlId: newItemUrl!.id,
      guid: `new-item-${suffix}`,
      itemData: {
        link: `https://cluster-agent-test-new-${suffix}.example.com`,
        guid: `new-item-${suffix}`,
        title: 'Apple Announces New iPhone',
        description: 'Apple held its annual product announcement event today.',
      },
      contentSha256: Buffer.alloc(32),
    })

    const candidateUrl = await addUrl(
      null,
      `https://cluster-agent-test-candidate-${suffix}.example.com`,
    )
    candidateItemId = await insertTestRssFeedItem({
      rssFeedId: testRssFeedId,
      urlId: candidateUrl!.id,
      guid: `candidate-item-${suffix}`,
      itemData: {
        link: `https://cluster-agent-test-candidate-${suffix}.example.com`,
        guid: `candidate-item-${suffix}`,
        title: 'New iPhone Revealed at Apple Event',
        description: "Coverage of Apple's product announcement.",
      },
      contentSha256: Buffer.alloc(32),
    })

    candidateItemIds = [candidateItemId]
    for (let i = 2; i <= 6; i++) {
      const extraCandidateUrl = await addUrl(
        null,
        `https://cluster-agent-test-candidate-${i}-${suffix}.example.com`,
      )
      const extraCandidateItemId = await insertTestRssFeedItem({
        rssFeedId: testRssFeedId,
        urlId: extraCandidateUrl!.id,
        guid: `candidate-item-${i}-${suffix}`,
        itemData: {
          link: `https://cluster-agent-test-candidate-${i}-${suffix}.example.com`,
          guid: `candidate-item-${i}-${suffix}`,
          title: `New iPhone Revealed at Apple Event ${i}`,
          description: `Additional coverage ${i} of Apple's product announcement.`,
        },
        contentSha256: Buffer.alloc(32),
      })
      candidateItemIds.push(extraCandidateItemId)
    }
  }, 30_000)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const makeCandidateRow = (id: string, storyId: string | null = null): CandidateRow => ({
    id,
    story_id: storyId,
    story_published_at: null,
    distance: 0.1,
  })

  it('returns null when item not found in DB', async () => {
    const result = await runStoryClusteringAgent('00000000-0000-0000-0000-000000000000', [
      makeCandidateRow(candidateItemId),
    ])
    expect(result).toBeNull()
  })

  it('returns null when no candidate items are found in DB', async () => {
    const result = await runStoryClusteringAgent(newItemId, [
      makeCandidateRow('00000000-0000-0000-0000-000000000001'),
    ])
    expect(result).toBeNull()
  })

  it('delegates to the clustering agent with the assembled prompt', async () => {
    const agentResult = {
      should_cluster: true,
      reason: 'Both articles cover the same Apple product announcement.',
      cluster_item_ids: [candidateItemId],
      title: 'Apple Announces New iPhone',
      official_rss_feed_item_id: newItemId,
      published_at: new Date().toISOString(),
    }
    const callOpenAIClusteringAgent = vi.fn<typeof callOpenAIClusteringAgentImpl>(
      async (content, safetyIdentifier) => {
        expect(content).toContain('Apple')
        expect(safetyIdentifier).toBe(newItemId)
        return agentResult
      },
    )

    const result = await runStoryClusteringAgent(newItemId, [makeCandidateRow(candidateItemId)], {
      callOpenAIClusteringAgent,
    })

    expect(result).toEqual(agentResult)
    expect(callOpenAIClusteringAgent).toHaveBeenCalledOnce()
  })

  it('limits candidates before building the agent prompt', async () => {
    const agentResult = {
      should_cluster: false,
      reason: 'No cluster needed.',
      cluster_item_ids: [],
    }
    const callOpenAIClusteringAgent = vi.fn<typeof callOpenAIClusteringAgentImpl>(
      async (content, safetyIdentifier) => {
        expect(safetyIdentifier).toBe(newItemId)
        expect(content).toContain(candidateItemIds[4])
        expect(content).not.toContain(candidateItemIds[5])
        return agentResult
      },
    )

    const result = await runStoryClusteringAgent(
      newItemId,
      candidateItemIds.map(id => makeCandidateRow(id)),
      { callOpenAIClusteringAgent },
    )

    expect(result).toMatchObject(agentResult)
    expect(callOpenAIClusteringAgent).toHaveBeenCalledOnce()
  })

  it('returns agent result when should_cluster=false (heuristic rejection)', async () => {
    const agentResult = {
      should_cluster: false,
      reason: 'One article is a rumor; the other is an official announcement.',
      cluster_item_ids: [],
    }
    const createOpenAIResponse = vi.fn<
      typeof import('@modules/openai-utils/create-response').createOpenAIResponse
    >(async () => makeTextResponse(JSON.stringify(agentResult)))

    const result = await callOpenAIClusteringAgentImpl('input', newItemId, {
      createOpenAIResponse,
    })

    expect(result).toMatchObject(agentResult)
  })

  it('records usage from a failed/incomplete response before rethrowing', async () => {
    // A queued retry after this failure is the only chance to attribute the charge -- the
    // call-site catch block must record from the thrown OpenAIResponseNotCompletedError, not
    // just from a successful response.
    const createOpenAIResponse = vi
      .fn<typeof import('@modules/openai-utils/create-response').createOpenAIResponse>()
      .mockRejectedValueOnce(
        new OpenAIResponseNotCompletedError('OpenAI response incomplete: max_output_tokens', {
          status: 'incomplete',
          model: 'gpt-5.4-nano-2026-03-17',
          service_tier: 'flex',
          usage: { input_tokens: 322, output_tokens: 44 },
          incomplete_details: { reason: 'max_output_tokens' },
        } as Response),
      )

    await expect(
      callOpenAIClusteringAgentImpl('input', newItemId, { createOpenAIResponse }),
    ).rejects.toThrow('OpenAI response incomplete: max_output_tokens')

    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent('story-clustering', { inputTokens: 322, outputTokens: 44 }),
    )
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.pricing_status).toBe('priced')
  })

  it('includes existing story_id in candidate context', async () => {
    const agentResult = {
      should_cluster: true,
      reason: 'Joins existing story.',
      cluster_item_ids: [candidateItemId],
      title: 'Apple Announces New iPhone',
      official_rss_feed_item_id: null,
      published_at: new Date().toISOString(),
    }

    const existingStoryId = '11111111-1111-1111-1111-111111111111'
    const candidate = makeCandidateRow(candidateItemId, existingStoryId)
    const callOpenAIClusteringAgent = vi.fn<typeof callOpenAIClusteringAgentImpl>(async content => {
      expect(content).toContain(existingStoryId)
      return agentResult
    })

    const result = await runStoryClusteringAgent(newItemId, [candidate], {
      callOpenAIClusteringAgent,
    })

    expect(result).toEqual(agentResult)
  })

  it('rethrows agent errors', async () => {
    const callOpenAIClusteringAgent = vi.fn<typeof callOpenAIClusteringAgentImpl>(async () => {
      throw new Error('OpenAI API error')
    })

    await expect(
      runStoryClusteringAgent(newItemId, [makeCandidateRow(candidateItemId)], {
        callOpenAIClusteringAgent,
      }),
    ).rejects.toThrow('OpenAI API error')
  })
})

function makeTextResponse(text: string): OpenAIResponse {
  return {
    id: 'resp_test',
    status: 'completed' as const,
    output: [
      {
        id: 'resp_test-message',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    output_text: text,
  }
}
