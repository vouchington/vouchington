import { describe, expect, it } from 'vitest'
import { REPORT_REASONS } from '@/lib/api/client/reports'
import { filterVisibleDuplicateClusters } from '../reports-clustered-state'
import type {
  AdminModerationReportCluster,
  AdminModerationReportDuplicateCluster,
} from '../reports-client-types'

describe('reports clustered state', () => {
  it('merges duplicate reason breakdowns in shared report reason order', () => {
    const duplicate = makeDuplicateCluster(
      REPORT_REASONS.map((option, index) =>
        makeCluster({
          id: `post:post-${index}`,
          entity_id: `post-${index}`,
          reason_breakdown: [{ reason: option.value, count: index + 1 }],
        }),
      ),
    )

    expect(filterVisibleDuplicateClusters([duplicate], new Set())[0]!.reason_breakdown).toEqual(
      REPORT_REASONS.map((option, index) => ({ reason: option.value, count: index + 1 })),
    )
  })
})

function makeDuplicateCluster(
  clusters: AdminModerationReportCluster[],
): AdminModerationReportDuplicateCluster {
  return {
    id: 'content-hash:test',
    signal: 'content_hash_duplicate',
    post_count: clusters.length,
    report_count: clusters.length,
    reason_breakdown: [],
    first_reported_at: '2026-06-01T00:00:00.000Z',
    last_reported_at: '2026-06-01T00:00:00.000Z',
    clusters,
  }
}

function makeCluster(
  overrides: Partial<AdminModerationReportCluster> = {},
): AdminModerationReportCluster {
  return {
    id: 'post:post-1',
    entity_type: 'post',
    entity_id: 'post-1',
    report_count: 1,
    reporter_count: 1,
    reason_breakdown: [{ reason: 'spam', count: 1 }],
    first_reported_at: '2026-06-01T00:00:00.000Z',
    last_reported_at: '2026-06-01T00:00:00.000Z',
    target_content: null,
    target_label: 'Reported post',
    target_path: '/discussion/reported-post',
    admin_action_path: '/discussion/reported-post',
    target_user_id: 'user-1',
    target_available: true,
    target_is_restricted: false,
    indicators: {
      content_hash_duplicate: true,
      embeddings_similarity: false,
      velocity_spike: false,
    },
    reports: [],
    ...overrides,
  }
}
