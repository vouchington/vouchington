import type {
  AdminClusteredModerationReportsResponse,
  AdminModerationReport,
} from '@/components/admin/reports-client'

export function makeClusteredReportsResponse(
  options: { duplicatePostIds?: string[] } = {},
): AdminClusteredModerationReportsResponse {
  const postIds = options.duplicatePostIds ?? ['post-1']
  const clusters = postIds.map((postId, index) =>
    makeCluster({
      id: `post:${postId}`,
      entity_id: postId,
      target_label: index === 0 ? 'Reported post' : `Reported post ${index + 1}`,
    }),
  )
  const duplicateClusters =
    postIds.length > 0
      ? [
          {
            id: 'content-hash:abc',
            signal: 'content_hash_duplicate' as const,
            post_count: postIds.length,
            report_count: clusters.reduce((sum, cluster) => sum + cluster.report_count, 0),
            reason_breakdown: [{ reason: 'spam' as const, count: clusters.length * 2 }],
            first_reported_at: '2026-05-31T00:00:00.000Z',
            last_reported_at: '2026-05-31T00:00:00.000Z',
            clusters,
          },
        ]
      : []
  return {
    cluster_mode: 'entity',
    results: clusters,
    duplicate_clusters: duplicateClusters,
    page_info: {
      has_next_page: false,
      has_previous_page: false,
      start_cursor: null,
      end_cursor: null,
    },
  }
}

export function makeCluster(
  overrides: Partial<AdminClusteredModerationReportsResponse['results'][number]> = {},
): AdminClusteredModerationReportsResponse['results'][number] {
  const report = makeReport({
    id: `report-${overrides.entity_id ?? 'post-1'}`,
    entity_id: overrides.entity_id ?? 'post-1',
    target_label: overrides.target_label ?? 'Reported post',
    note: 'Copied post',
  })
  return {
    id: 'post:post-1',
    entity_type: 'post',
    entity_id: 'post-1',
    report_count: 2,
    reporter_count: 2,
    reason_breakdown: [{ reason: 'spam', count: 2 }],
    first_reported_at: '2026-05-31T00:00:00.000Z',
    last_reported_at: '2026-05-31T00:00:00.000Z',
    target_content: null,
    target_label: 'Reported post',
    target_path: '/discussion/reported-post',
    admin_action_path: '/discussion/reported-post',
    target_user_id: 'user-2',
    target_available: true,
    target_is_restricted: false,
    indicators: {
      content_hash_duplicate: true,
      embeddings_similarity: false,
      velocity_spike: true,
    },
    reports: [report, makeReport({ id: `${report.id}-2`, note: null })],
    ...overrides,
  }
}

function makeReport(overrides: Partial<AdminModerationReport> = {}): AdminModerationReport {
  return {
    id: 'report-1',
    case_id: 'case-1',
    created_at: '2026-05-31T00:00:00.000Z',
    reviewed_at: null,
    reporter_user_id: 'user-1',
    reporter_username: 'reader',
    entity_type: 'post',
    entity_id: 'post-1',
    admin_action_path: '/discussion/reported-post',
    target_label: 'Reported post',
    target_path: '/discussion/reported-post',
    target_user_id: null,
    target_available: true,
    target_is_restricted: false,
    reason: 'spam',
    note: null,
    status: 'pending',
    report_count: 1,
    resolved_by_id: null,
    is_system_generated: false,
    judgement: null,
    post_moderation_context: null,
    ...overrides,
    target_content: overrides.target_content ?? null,
  }
}
