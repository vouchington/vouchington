import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const mockRefresh = vi.fn<() => void>()
const {
  mockDeletePost,
  mockResolveModerationReport,
  mockRerunReportJudgement,
  mockOnError,
  mockOnSuccess,
} = vi.hoisted(() => ({
  mockDeletePost: vi.fn<VitestLooseMock>(),
  mockResolveModerationReport: vi.fn<VitestLooseMock>(),
  mockRerunReportJudgement: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/posts'), () => ({
  deletePost: mockDeletePost,
}))

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveModerationReport: mockResolveModerationReport,
  rerunReportJudgement: mockRerunReportJudgement,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError, onSuccess: mockOnSuccess }))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

import { ReportsClient } from '../reports-client'
import {
  makeCluster,
  makeClusteredReportsResponse,
} from '@/test-helpers/components/reports-client-clustered-fixtures'

describe('ReportsClient clustered staff reports', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders report clusters with reason breakdown and indicators', () => {
    renderStaffReports()

    expect(screen.getByText('Reported post')).toBeVisible()
    expect(screen.getAllByText('2 reports').length).toBeGreaterThan(0)
    expect(screen.getByText('spam 2')).toBeVisible()
    expect(screen.getAllByText('Content duplicate').length).toBeGreaterThan(0)
    expect(screen.getByText('Vote spike')).toBeVisible()
    expect(screen.getByText('Copied post')).toBeVisible()
  })

  it('removes every post in a duplicate cluster once', async () => {
    mockDeletePost.mockResolvedValue(undefined)
    renderStaffReports(
      makeClusteredReportsResponse({ duplicatePostIds: ['post-1', 'post-2', 'post-3'] }),
    )

    fireEvent.click(screen.getByRole('button', { name: /remove all/i }))
    fireEvent.click(screen.getByRole('button', { name: /remove posts/i }))

    await waitFor(() => expect(mockDeletePost).toHaveBeenCalledTimes(3))
    expect(mockDeletePost).toHaveBeenCalledWith('post-1')
    expect(mockDeletePost).toHaveBeenCalledWith('post-2')
    expect(mockDeletePost).toHaveBeenCalledWith('post-3')
    await waitFor(() => expect(screen.queryByText('Reported post')).not.toBeInTheDocument())
  })

  it('reviews loaded reports and keeps partial clusters visible until refresh', async () => {
    mockResolveModerationReport.mockResolvedValue(undefined)
    renderStaffReports({
      ...makeClusteredReportsResponse(),
      results: [makeCluster({ report_count: 3 })],
    })

    fireEvent.click(screen.getByRole('button', { name: /review loaded/i }))

    await waitFor(() => expect(mockResolveModerationReport).toHaveBeenCalledTimes(2))
    expect(mockResolveModerationReport).toHaveBeenCalledWith('report-post-1', 'reviewed')
    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.getByText('Reported post')).toBeInTheDocument()
  })

  it('refreshes after partial cluster resolution failure', async () => {
    mockResolveModerationReport
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('already resolved'))
    renderStaffReports()

    fireEvent.click(screen.getAllByRole('button', { name: /review all/i })[0]!)

    await waitFor(() => expect(mockResolveModerationReport).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockOnError).toHaveBeenCalled())
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('hides duplicate cards when local removals drop below the duplicate threshold', async () => {
    mockResolveModerationReport.mockResolvedValue(undefined)
    renderStaffReports(
      makeClusteredReportsResponse({ duplicatePostIds: ['post-1', 'post-2', 'post-3'] }),
    )

    expect(screen.getByRole('button', { name: /remove all/i })).toBeVisible()

    fireEvent.click(screen.getAllByRole('button', { name: /review all/i })[0]!)

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /remove all/i })).not.toBeInTheDocument(),
    )
  })

  it('shows a fresh cluster wave after previous local removal', async () => {
    mockResolveModerationReport.mockResolvedValue(undefined)
    const { rerender } = renderStaffReports()

    fireEvent.click(screen.getAllByRole('button', { name: /review all/i })[0]!)

    await waitFor(() => expect(screen.queryByText('Reported post')).not.toBeInTheDocument())
    rerender(
      <ReportsClient
        viewerTier='staff'
        data={{
          ...makeClusteredReportsResponse(),
          results: [makeCluster({ last_reported_at: '2026-06-01T00:00:00.000Z' })],
        }}
      />,
    )
    expect(screen.getByText('Reported post')).toBeInTheDocument()
  })

  it('removes comment targets from a cluster', async () => {
    mockDeletePost.mockResolvedValue(undefined)
    renderStaffReports({
      ...makeClusteredReportsResponse({ duplicatePostIds: [] }),
      results: [
        makeCluster({
          entity_type: 'comment',
          entity_id: 'comment-1',
          id: 'comment:comment-1',
        }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: /remove target/i }))

    await waitFor(() => expect(mockDeletePost).toHaveBeenCalledWith('comment-1'))
    await waitFor(() => expect(screen.queryByText('Reported post')).not.toBeInTheDocument())
  })

  it('refreshes after partial duplicate removal failure', async () => {
    mockDeletePost
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce(undefined)
    renderStaffReports(
      makeClusteredReportsResponse({ duplicatePostIds: ['post-1', 'post-2', 'post-3'] }),
    )

    fireEvent.click(screen.getByRole('button', { name: /remove all/i }))
    fireEvent.click(screen.getByRole('button', { name: /remove posts/i }))

    await waitFor(() => expect(mockDeletePost).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(mockOnError).toHaveBeenCalled())
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('reruns judgement and renders next-page links with filters', async () => {
    mockRerunReportJudgement.mockResolvedValue({ queued: true, rerun_by_id: 'admin-1' })
    renderStaffReports(
      {
        ...makeClusteredReportsResponse(),
        page_info: {
          has_next_page: true,
          has_previous_page: false,
          start_cursor: 'start-1',
          end_cursor: 'cursor-1',
        },
      },
      { statusFilter: 'pending', sortOrder: 'created_at_asc' },
    )

    fireEvent.click(screen.getAllByRole('button', { name: /re-run judgement/i })[0]!)

    await waitFor(() => expect(mockRerunReportJudgement).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: /next page/i })).toHaveAttribute(
      'href',
      '/reports?status=pending&sort=created_at_asc&cluster=entity&after=cursor-1',
    )
  })

  it('hides duplicate removal outside the pending report filter', () => {
    renderStaffReports(makeClusteredReportsResponse(), { statusFilter: 'reviewed' })

    expect(screen.queryByRole('button', { name: /remove all/i })).not.toBeInTheDocument()
  })
})

function renderStaffReports(
  data = makeClusteredReportsResponse(),
  options: Pick<ComponentProps<typeof ReportsClient>, 'statusFilter' | 'sortOrder'> = {},
) {
  return render(
    <ReportsClient
      viewerTier='staff'
      data={data}
      {...options}
    />,
  )
}
