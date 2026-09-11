import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ReportsClient,
  type AdminClusteredModerationReportsResponse,
  type AdminModerationReport,
} from '../reports-client'

const mockRefresh = vi.fn<() => void>()
const { mockConfirmBanEvasion } = vi.hoisted(() => ({
  mockConfirmBanEvasion: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/community-ban-evasion'), () => ({
  confirmCommunityBanEvasion: mockConfirmBanEvasion,
  dismissCommunityBanEvasion: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/posts'), () => ({ deletePost: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveModerationReport: vi.fn<VitestLooseMock>(),
  rerunReportJudgement: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

describe('clustered ban-evasion refresh', () => {
  afterEach(() => vi.clearAllMocks())

  it('refreshes without optimistically hiding a mixed cluster after action', async () => {
    mockConfirmBanEvasion.mockResolvedValue(undefined)
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeResponse()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /confirm ban evasion/i }))

    await waitFor(() =>
      expect(mockConfirmBanEvasion).toHaveBeenCalledWith('community-1', 'suspect-1'),
    )
    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.getByText('Suspect')).toBeInTheDocument()
  })
})

function makeResponse(): AdminClusteredModerationReportsResponse {
  return {
    cluster_mode: 'entity',
    results: [
      {
        id: 'user:suspect-1',
        entity_type: 'user',
        entity_id: 'suspect-1',
        report_count: 2,
        reporter_count: 2,
        reason_breakdown: [{ reason: 'other', count: 2 }],
        first_reported_at: '2026-05-31T00:00:00.000Z',
        last_reported_at: '2026-05-31T00:00:00.000Z',
        target_content: null,
        target_label: 'Suspect',
        target_path: '/user/suspect',
        admin_action_path: '/user/suspect',
        target_user_id: 'suspect-1',
        target_available: true,
        target_is_restricted: false,
        indicators: {
          content_hash_duplicate: false,
          embeddings_similarity: false,
          velocity_spike: false,
        },
        reports: [makeSystemReport(), makeOrdinaryReport()],
      },
    ],
    duplicate_clusters: [],
    page_info: {
      has_next_page: false,
      has_previous_page: false,
      start_cursor: null,
      end_cursor: null,
    },
  }
}

function makeSystemReport(): AdminModerationReport {
  return {
    ...makeOrdinaryReport(),
    id: 'ban-evasion-report',
    is_system_generated: true,
    community_ban_evasion: {
      community_id: 'community-1',
      community_slug: 'community',
      source_user_id: 'source-1',
      source_username: 'source',
      score: 0.9,
      flagged_at: '2026-05-31T00:00:00.000Z',
    },
  }
}

function makeOrdinaryReport(): AdminModerationReport {
  return {
    id: 'ordinary-report',
    case_id: 'case-1',
    created_at: '2026-05-31T00:00:00.000Z',
    reviewed_at: null,
    reporter_user_id: 'user-1',
    reporter_username: 'reader',
    entity_type: 'user',
    entity_id: 'suspect-1',
    admin_action_path: '/user/suspect',
    target_content: null,
    target_label: 'Suspect',
    target_path: '/user/suspect',
    target_user_id: 'suspect-1',
    target_available: true,
    target_is_restricted: false,
    reason: 'other',
    note: null,
    status: 'pending',
    report_count: 2,
    resolved_by_id: null,
    is_system_generated: false,
    judgement: null,
    post_moderation_context: null,
  }
}
