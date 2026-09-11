import { describe, expect, it } from 'vitest'
import {
  ordinaryResolutionRemovesWholeCluster,
  selectOrdinaryPendingReports,
} from '../reports-clustered-actions'
import type { AdminModerationReportCluster } from '../reports-client-types'

describe('clustered report actions', () => {
  it('selects pending ordinary reports and skips ban-evasion reports', () => {
    const cluster = makeCluster([
      makeReport('ordinary'),
      makeReport('ban-evasion', { community_ban_evasion: makeBanEvasionContext() }),
      makeReport('reviewed', { status: 'reviewed' }),
    ])

    expect(selectOrdinaryPendingReports(cluster).map(report => report.id)).toEqual(['ordinary'])
  })

  it('skips system-generated reports when ban-evasion context is missing', () => {
    const cluster = makeCluster([
      makeReport('ordinary'),
      makeReport('system-only', { is_system_generated: true }),
    ])

    expect(selectOrdinaryPendingReports(cluster).map(report => report.id)).toEqual(['ordinary'])
  })

  it('keeps a mixed cluster visible after resolving its ordinary reports', () => {
    const cluster = makeCluster([
      makeReport('ordinary'),
      makeReport('ban-evasion', { community_ban_evasion: makeBanEvasionContext() }),
    ])

    expect(
      ordinaryResolutionRemovesWholeCluster(cluster, [{ status: 'fulfilled', value: {} }]),
    ).toBe(false)
  })

  it('keeps a cluster visible when any ordinary report update fails', () => {
    const cluster = makeCluster([makeReport('first'), makeReport('second')])

    expect(
      ordinaryResolutionRemovesWholeCluster(cluster, [
        { status: 'fulfilled', value: {} },
        { status: 'rejected', reason: new Error('failed') },
      ]),
    ).toBe(false)
  })

  it('removes a fully loaded ordinary cluster after every update succeeds', () => {
    const cluster = makeCluster([makeReport('first'), makeReport('second')])

    expect(
      ordinaryResolutionRemovesWholeCluster(cluster, [
        { status: 'fulfilled', value: {} },
        { status: 'fulfilled', value: {} },
      ]),
    ).toBe(true)
  })
})

function makeReport(
  id: string,
  overrides: Partial<AdminModerationReportCluster['reports'][number]> = {},
): AdminModerationReportCluster['reports'][number] {
  return {
    id,
    case_id: 'case-1',
    created_at: '2026-07-14T00:00:00.000Z',
    reviewed_at: null,
    reporter_user_id: 'reporter-1',
    reporter_username: 'reporter',
    entity_type: 'user',
    entity_id: 'user-1',
    admin_action_path: null,
    target_content: null,
    target_label: 'User',
    target_path: '/users/user-1',
    target_user_id: 'user-1',
    target_available: true,
    target_is_restricted: false,
    reason: 'other',
    note: null,
    status: 'pending',
    report_count: 1,
    resolved_by_id: null,
    is_system_generated: false,
    judgement: null,
    post_moderation_context: null,
    ...overrides,
  }
}

function makeCluster(
  reports: AdminModerationReportCluster['reports'],
): AdminModerationReportCluster {
  return {
    id: 'user:user-1',
    entity_type: 'user',
    entity_id: 'user-1',
    report_count: reports.length,
    reporter_count: reports.length,
    reason_breakdown: [{ reason: 'other', count: reports.length }],
    first_reported_at: '2026-07-14T00:00:00.000Z',
    last_reported_at: '2026-07-14T00:00:00.000Z',
    target_content: null,
    target_label: 'User',
    target_path: '/users/user-1',
    admin_action_path: null,
    target_user_id: 'user-1',
    target_available: true,
    target_is_restricted: false,
    indicators: {
      content_hash_duplicate: false,
      embeddings_similarity: false,
      velocity_spike: false,
    },
    reports,
  }
}

function makeBanEvasionContext() {
  return {
    community_id: 'community-1',
    community_slug: 'community-1',
    source_user_id: 'user-2',
    source_username: 'source',
    score: 0.9,
    flagged_at: '2026-07-14T00:00:00.000Z',
  }
}
