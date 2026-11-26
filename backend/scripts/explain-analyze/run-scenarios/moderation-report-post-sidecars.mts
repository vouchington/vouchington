import assert from 'node:assert/strict'
import { selectPostIndicators } from '@services/moderation-reports/clustered-indicators'
import type { ClusterRow } from '@services/moderation-reports/clustered-types'
import { getPostModerationContextBatch } from '@services/moderation-reports/post-moderation-context'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  loadReportPostSidecars,
  REPORT_POST_PAGE_CAP,
  SIDECAR_HASH,
} from '../seed-data/moderation-report-post-sidecars.mts'

const CONTEXT_QUERIES = [
  'getPostModerationContextBatch:posts',
  'getPostModerationContextBatch:agents',
  'getPostModerationContextBatch:tags',
] as const

type SidecarFixture = Awaited<ReturnType<typeof loadReportPostSidecars>>
type SidecarCounts = Awaited<ReturnType<SidecarFixture['countCandidates']>>

async function captureModerationContext(
  postIds: string[],
  moderator: SidecarFixture['moderator'],
  counts: SidecarCounts,
) {
  const scenario = 'moderation-report-post-context-at-cap'
  registerScenarioContract(scenario, {
    crossPartition: {
      relation__post__category__topic:
        'A report page can hydrate tags for posts from different months.',
    },
    seededRows: { moderator_agents: moderator.moderator_count },
    // Main walks the current policy range per post and the moderator's tag history once.
    // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7188165342
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: REPORT_POST_PAGE_CAP, captureIndex: 0 },
      {
        kind: 'maxProcessedRows',
        relation: 'post_moderation_versions',
        max: REPORT_POST_PAGE_CAP * counts.version_rows,
        captureIndex: 0,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'post_moderation_dispositions',
        max: REPORT_POST_PAGE_CAP,
        captureIndex: 0,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__post__category__topic',
        // PostgreSQL rounds per-loop row counts before the harness totals them.
        max: counts.tag_rows + moderator.moderator_count,
        captureIndex: 1,
      },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const contexts = await getPostModerationContextBatch(postIds, 'staff')
      assert.deepEqual([...contexts.keys()].toSorted(), postIds)
      for (const context of contexts.values()) {
        assert.deepEqual(context, {
          platform_moderation: { is_flagged: true, categories: ['spam'] },
          agent_moderations: [{ slug: moderator.slug, is_flagged: true, categories: ['spam'] }],
          agent_added_tags: [moderator.topic_slug],
        })
      }
    },
    undefined,
    // The existing agent-moderation scan gate rejects the custom plan.
    // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7188127514
    [CONTEXT_QUERIES[0], CONTEXT_QUERIES[2]],
    { exactCapturedNames: CONTEXT_QUERIES },
  )
}

function postCluster(entityId: string): ClusterRow {
  const now = new Date()
  return {
    entity_type: 'post',
    entity_id: entityId,
    report_count: 1,
    reporter_count: 1,
    report_count_capped: false,
    reason_counts: { spam: 1 },
    first_reported_at: now,
    last_reported_at: now,
    cursor_created_at: now.toISOString(),
    admin_action_path: null,
    target_label: 'Report fixture',
    target_content: null,
    target_path: null,
    target_user_id: null,
    target_available: true,
    target_is_restricted: false,
  }
}

async function captureClusterIndicators(postIds: string[], counts: SidecarCounts) {
  const scenario = 'moderation-report-post-indicators-at-cap'
  const query = 'listClusteredModerationReports:postIndicators'
  registerScenarioContract(scenario, {
    // Both evidence branches walk the current policy range on main.
    // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7188165342
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: REPORT_POST_PAGE_CAP },
      {
        kind: 'maxProcessedRows',
        relation: 'post_moderation_versions',
        max: 2 * counts.version_rows,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'post_moderation_dispositions',
        max: 2 * counts.version_rows,
      },
      { kind: 'maxProcessedRows', relation: 'vote_integrity_flags', max: counts.pending_flags },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const results = await selectPostIndicators(postIds.map(postCluster))
      const liveIds = postIds.slice(0, -1)
      assert.deepEqual([...results.keys()].toSorted(), liveIds)
      for (const [i, id] of liveIds.entries()) {
        assert.deepEqual(results.get(id), {
          indicators: {
            content_hash_duplicate: true,
            embeddings_similarity: false,
            velocity_spike: i % 2 === 0,
          },
          contentHashHex: SIDECAR_HASH.toString('hex'),
        })
      }
    },
    undefined,
    query,
    { exactCapturedNames: [query] },
  )
}

export async function runModerationReportPostSidecars(): Promise<void> {
  const { reportPostIds, moderator, cleanup, countCandidates } = await loadReportPostSidecars()
  try {
    assert.equal(reportPostIds.length, REPORT_POST_PAGE_CAP)
    const counts = await countCandidates()
    await captureModerationContext(reportPostIds, moderator, counts)
    await captureClusterIndicators(reportPostIds, counts)
  } finally {
    await cleanup()
  }
}
