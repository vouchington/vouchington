import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CommunityModerationReport } from '@/types/api-responses'

const { mockOnError, mockPush } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockPush: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/modmail'), () => ({
  openModmailThreadForReport: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/community-ban-evasion'), () => ({
  confirmCommunityBanEvasion: vi.fn<() => Promise<void>>(),
  dismissCommunityBanEvasion: vi.fn<() => Promise<void>>(),
}))
vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))
vi.mock(
  import('next/navigation'),
  () => ({ useRouter: () => ({ push: mockPush }) }) as unknown as typeof import('next/navigation'),
)

import { ModQueueReports } from '../mod-queue-reports'

describe('ModQueueReports authored language', () => {
  it('marks only the authored report target title', () => {
    const report = {
      id: 'report-1',
      entity_type: 'comment',
      entity_id: 'post-1',
      reason: 'spam',
      note: null,
      status: 'pending',
      target_label: 'Test Post',
      target_content: {
        kind: 'comment',
        text: 'عنوان الجذر',
        declared_language: 'ar',
        lingua_rs_detected_language: 'en',
      },
      target_path: '/posts/post-1',
      created_at: '2026-01-01T00:00:00Z',
    } as CommunityModerationReport

    render(
      <ModQueueReports
        communitySlug='my-community'
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[report]}
        selectedIds={new Set()}
      />,
    )

    const title = screen.getByText('عنوان الجذر')
    expect(title).toHaveAttribute('lang', 'ar')
    expect(title).toHaveAttribute('dir', 'rtl')
    expect(screen.getByText(/Comment on/)).not.toHaveAttribute('lang')
  })
})
