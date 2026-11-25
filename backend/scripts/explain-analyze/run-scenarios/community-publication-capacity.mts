import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { getPinnedPosts } from '@services/communities/publications/pinned'
import { searchCommunityAgentModerations } from '@services/community-agent-prompts/moderations'
import { listCommunityPendingModerationReports } from '@services/moderation-claims/community-pending-reports'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCommunityPublicationCapacity } from './community-publication-capacity-fixture.mts'

const limit = 100

export async function runCommunityPublicationCapacityScenarios(): Promise<void> {
  const fixture = await seedCommunityPublicationCapacity()
  try {
    await write(`/* analyzeCommunityPublicationCapacity */
      ANALYZE posts, moderation_reports, moderation_report_judgements, community_members,
        community_pinned_posts, community_post_reviews, agent_moderations, community_agent_prompts`)
    await runPendingReports(fixture)
    await runAgentModerations(fixture)
    await runPinnedPosts(fixture)
  } finally {
    await fixture.cleanup()
  }
}

type Fixture = Awaited<ReturnType<typeof seedCommunityPublicationCapacity>>

async function runPendingReports({
  communityId,
  rankedReportIds,
  timeReportIds,
  seededRows,
}: Fixture) {
  const statements = ['listCommunityPendingModerationReports', 'fetchBanEvasionReports']
  for (const [sort, expected] of [
    ['severity', rankedReportIds],
    ['created_at_desc', timeReportIds],
  ] as const) {
    const scenario = `community-pending-reports-cap-${sort}`
    registerScenarioContract(scenario, {
      // Keep the main scan ceiling until the count stops scanning reports for every candidate (#6402).
      expectations: [{ kind: 'maxProcessedRows', relation: 'moderation_reports', max: 2_628_054 }],
      seededRows,
      crossPartition: { posts: 'Reports can target community posts from any month.' },
    })
    await runAndCapture(
      scenario,
      async () => {
        const first = await listCommunityPendingModerationReports({ communityId, limit, sort })
        assert.deepEqual(
          first.reports.map(row => row.id),
          expected.slice(0, limit),
        )
        assert.equal(first.hasNextPage, true)
        const boundary = first.reports.at(-1)!
        const next = await listCommunityPendingModerationReports({
          communityId,
          limit,
          sort,
          afterCursor: {
            id: boundary.id,
            severityRank: boundary.cursor_severity_rank,
            reportCount: boundary.cursor_report_count,
          },
        })
        assert.deepEqual(
          next.reports.map(row => row.id),
          expected.slice(limit, limit * 2),
        )
        assert.equal(next.hasNextPage, true)
        assert.ok(next.reports.some(row => row.is_system_generated))
        assert.ok(next.reports.some(row => !row.is_system_generated))
      },
      undefined,
      statements,
    )
  }
}

async function runAgentModerations({
  communityId,
  agentPostId,
  moderationIds,
  seededRows,
}: Fixture) {
  const scenario = 'community-agent-moderations-cap'
  const name = 'searchCommunityAgentModerations'
  const scope = `community:${communityId}:post:${agentPostId}:agent-moderations`
  registerScenarioContract(scenario, {
    seededRows,
    // Allow today's broad post-history scan until both plans can use the community scope (#6403).
    expectations: [{ kind: 'maxProcessedRows', relation: 'agent_moderations', max: 735 }],
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
      assert.equal(
        next.page_info.end_cursor,
        encodeScopedUuidCursor(moderationIds[limit * 2 - 1]!, scope),
      )
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
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
