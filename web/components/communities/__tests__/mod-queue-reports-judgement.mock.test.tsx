import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CommunityModerationReport } from '@/types/api-responses'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

import { ModQueueReports } from '../mod-queue-reports'

function makeReport(overrides?: Partial<CommunityModerationReport>): CommunityModerationReport {
  return {
    id: 'report-judgement-1',
    entity_type: 'post',
    entity_id: 'post-1',
    reason: 'spam',
    note: null,
    status: 'pending',
    target_label: 'Test Post',
    target_path: '/posts/post-1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as CommunityModerationReport
}

describe('ModQueueReports judgement', () => {
  it('renders stale judgement state on community report cards', () => {
    render(
      <ModQueueReports
        communitySlug='my-community'
        loading={null}
        onResolve={vi.fn<VitestLooseMock>()}
        onSelectionToggle={vi.fn<VitestLooseMock>()}
        reports={[
          makeReport({
            judgement: {
              recommended_action: 'warn',
              public_response: 'Needs another look.',
              internal_response: 'Older report context.',
              is_stale: true,
              judged_report_count: 1,
              current_report_count: 2,
            },
          }),
        ]}
        selectedIds={new Set()}
      />,
    )

    expect(screen.getByText('warn')).toBeInTheDocument()
    expect(screen.getByText('Outdated')).toBeInTheDocument()
  })
})
