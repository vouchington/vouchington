import { runModerationBanEvasionContextCapacity } from './moderation-ban-evasion-context-capacity.mts'
import { runModerationQueueClaimCapacity } from './moderation-queue-claim-capacity.mts'
import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { getPinnedPosts } from '@services/communities/publications/pinned'
import { searchCommunityAgentModerations } from '@services/community-agent-prompts/moderations'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCommunityPublicationCapacity } from './community-publication-capacity-fixture.mts'
import { runCommunityPendingReportCapacity } from './community-pending-report-capacity.mts'

const limit = 100

export async function runCommunityPublicationCapacityScenarios(): Promise<void> {
  const fixture = await seedCommunityPublicationCapacity()
  try {
    await write(`/* analyzeCommunityPublicationCapacity */
      ANALYZE posts, moderation_reports, moderation_report_judgements, community_members,
        community_pinned_posts, community_post_reviews, agent_moderations, community_agent_prompts`)
    await runCommunityPendingReportCapacity(fixture)
    await runAgentModerations(fixture)
    await runPinnedPosts(fixture)
    await runModerationQueueClaimCapacity(fixture.communityId, fixture.reports, fixture.posts)
    await runModerationBanEvasionContextCapacity(fixture.communityId, fixture.otherCommunityId)
  } finally {
    await fixture.cleanup()
  }
}

type Fixture = Awaited<ReturnType<typeof seedCommunityPublicationCapacity>>

async function runAgentModerations({
  communityId,
  agentPostId,
  moderationIds,
  seededRows,
}: Fixture) {
  const scenario = 'community-agent-moderations-cap'
  const name = 'searchCommunityAgentModerations'
  const scope = `community:${communityId}:post:${agentPostId}:agent-moderations`
  const finalPageCursor = encodeScopedUuidCursor(moderationIds[limit * 2 - 1]!, scope)
  registerScenarioContract(scenario, {
    seededRows,
    expectations: [{ kind: 'maxProcessedRows', relation: 'agent_moderations', max: limit + 1 }],
  })
  await runAndCapture(
    scenario,
    async () => {
      const first = await searchCommunityAgentModerations(agentPostId, communityId, { limit })
      assert.deepEqual(
        first.results.map(row => row.id),
        moderationIds.slice(0, limit),
      )
      assert.equal(first.page_info.has_next_page, true)
      assert.equal(
        first.page_info.end_cursor,
        encodeScopedUuidCursor(moderationIds[limit - 1]!, scope),
      )
      const next = await searchCommunityAgentModerations(agentPostId, communityId, {
        limit,
        after: first.page_info.end_cursor!,
      })
      assert.deepEqual(
        next.results.map(row => row.id),
        moderationIds.slice(limit, limit * 2),
      )
      assert.equal(next.page_info.has_next_page, true)
      assert.equal(next.page_info.end_cursor, finalPageCursor)
    },
    undefined,
    name,
    {
      exactCapturedNames: [name, name],
      afterCapture: async () => {
        const last = await searchCommunityAgentModerations(agentPostId, communityId, {
          limit,
          after: finalPageCursor,
        })
        assert.deepEqual(
          last.results.map(row => row.id),
          moderationIds.slice(limit * 2),
        )
        assert.equal(last.page_info.has_next_page, false)
        assert.equal(last.page_info.end_cursor, null)
      },
    },
  )
}

async function runPinnedPosts({ communityId, pinnedIds, seededRows }: Fixture) {
  const scenario = 'community-pinned-posts-cap'
  const name = 'getPinnedPosts'
  registerScenarioContract(scenario, {
    expectations: [{ kind: 'maxProcessedRows', relation: 'community_pinned_posts', max: 3 }],
    seededRows,
    crossPartition: { posts: 'A community can pin posts created in different months.' },
  })
  await runAndCapture(
    scenario,
    async () => {
      const pins = await getPinnedPosts(communityId)
      assert.deepEqual(
        pins.map(row => row.post_id),
        pinnedIds,
      )
      assert.deepEqual(
        pins.map(row => row.order_index),
        [0, 1, 2],
      )
    },
    undefined,
    name,
    { exactCapturedNames: [name] },
  )
}
