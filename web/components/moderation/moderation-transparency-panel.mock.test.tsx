import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { ModerationTransparencyPanel } from '@/components/moderation/moderation-transparency-panel'
import type { ModerationTransparency } from '@/types/moderation-analytics'
import { ApiError } from '@vouchington/api-client'

const { fetchModerationTransparencyMock } = vi.hoisted(() => ({
  fetchModerationTransparencyMock: vi.fn<() => Promise<ModerationTransparency>>(),
}))
vi.mock<typeof import('@/lib/api/client/moderation-transparency')>(
  import('@/lib/api/client/moderation-transparency'),
  () => ({
    fetchModerationTransparency: fetchModerationTransparencyMock,
    fetchCommunityModerationTransparency: vi.fn<() => Promise<ModerationTransparency>>(),
  }),
)

describe('ModerationTransparencyPanel', () => {
  it('renders released aggregate rows from the paid transparency API shape', () => {
    renderPanel(makeTransparency())

    expect(screen.getByRole('heading', { name: 'Moderation Transparency' })).toBeInTheDocument()
    expect(screen.getByText('Automated moderation')).toBeInTheDocument()
    expect(screen.getByText('Community AI')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText('Jan 1, 2026')).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Moderation Transparency' })
    expect(table.querySelector('caption')).toHaveTextContent('Moderation Transparency')
    expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(4)
  })

  it('renders a loading state before aggregate data is available', () => {
    renderPanel(undefined, true)

    expect(screen.getByText('Loading moderation transparency…')).toBeInTheDocument()
    expect(screen.getByText('Loading moderation transparency…')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('formats bucket dates with the resolved UI locale', () => {
    renderPanel(makeTransparency(), false, 'en-GB')

    expect(screen.getByText('1 Jan 2026')).toBeInTheDocument()
  })

  it('renders all-time buckets by locale-aware month and year with a period heading', () => {
    renderPanel({ ...makeTransparency(), range: 'all' }, false, 'en-GB')

    expect(screen.getByText('Jan 2026')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Period:' })).toBeInTheDocument()
  })

  it('loads and merges an older global all-time page until its cursor is exhausted', async () => {
    fetchModerationTransparencyMock.mockResolvedValueOnce({
      range: 'all',
      buckets: [
        {
          date: '2025-12-01',
          metric: 'automated_moderation',
          category: 'community_ai',
          count: 30,
        },
      ],
    })
    renderPanel({ ...makeTransparency(), range: 'all', next_cursor: 'older' })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(fetchModerationTransparencyMock).toHaveBeenCalledWith({
      range: 'all',
      after: 'older',
    })
    expect(await screen.findByText('30')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('offers manual continuation on an empty all-time page', async () => {
    fetchModerationTransparencyMock.mockResolvedValueOnce({ range: 'all', buckets: [] })
    renderPanel({ range: 'all', buckets: [], next_cursor: 'older-empty' })

    expect(screen.queryByText('No aggregate data is available for this period.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('No aggregate data is available for this period.')).toBeVisible()
    expect(fetchModerationTransparencyMock).toHaveBeenCalledWith({
      range: 'all',
      after: 'older-empty',
    })
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('replaces paid rows when an all-time continuation loses access', async () => {
    fetchModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))
    renderPanel({ ...makeTransparency(), range: 'all', next_cursor: 'older' })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Moderation transparency is available with Plus or Pro.',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('25')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('renders source-specific automated moderation categories', () => {
    renderPanel({
      range: '30d',
      buckets: ['openai_omni', 'agent_moderation', 'post_clearance_reject', 'spam_detection'].map(
        (category, index) => ({
          date: `2026-01-${String(index + 1).padStart(2, '0')}`,
          metric: 'automated_moderation' as const,
          category,
          count: 25,
        }),
      ),
    })

    expect(screen.getByText('OpenAI moderation')).toBeInTheDocument()
    expect(screen.getByText('Agent moderation')).toBeInTheDocument()
    expect(screen.getByText('Post clearance rejection')).toBeInTheDocument()
    expect(screen.getByText('Spam detection')).toBeInTheDocument()
  })

  it('renders the privacy-suppressed empty state without rows', () => {
    renderPanel({ range: '30d', buckets: [] })

    expect(screen.getByText('No aggregate data is available for this period.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders the paid upgrade state for a forbidden response', () => {
    renderPanel(null)

    expect(
      screen.getByRole('heading', {
        name: 'Moderation transparency is available with Plus or Pro.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View plans' }).getAttribute('href')).toBe('/plans')
  })

  it('clears released rows when a downgrade or identity change removes access', () => {
    const view = renderPanel(makeTransparency())
    expect(screen.getByText('25')).toBeInTheDocument()

    view.rerender(
      <UiLocaleProvider uiLocale='en-US'>
        <ModerationTransparencyPanel transparency={null} />
      </UiLocaleProvider>,
    )

    expect(screen.queryByText('25')).toBeNull()
    expect(
      screen.getByRole('heading', {
        name: 'Moderation transparency is available with Plus or Pro.',
      }),
    ).toBeInTheDocument()
  })

  it('uses a localized fallback for an unknown category and permits table overflow on narrow screens', () => {
    renderPanel({
      range: '30d',
      buckets: [
        {
          date: '2026-01-01',
          metric: 'reports',
          category: 'internal_only_category',
          count: 25,
        },
      ],
    })

    expect(screen.getByText('Other')).toBeInTheDocument()
    expect(screen.queryByText('Internal only category')).toBeNull()
  })

  it('uses the safe fallback when the API introduces an unknown metric', () => {
    renderPanel({
      range: '30d',
      buckets: [
        {
          date: '2026-01-01',
          metric: 'future_metric' as ModerationTransparency['buckets'][number]['metric'],
          category: 'community_ai',
          count: 25,
        },
      ],
    })

    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('renders every current moderation action category with its localized label', () => {
    renderPanel({ range: '30d', buckets: moderationActionBuckets() })

    for (const label of [
      'Remove',
      'Approve',
      'Reject',
      'Ban',
      'Lift ban',
      'Activate restriction',
      'Lift restriction',
      'Warn',
      'Lock',
      'Unlock',
      'Pin',
      'Unpin',
      'Suspend',
      'Unsuspend',
      'Remove member',
      'Change role',
      'Resolve report',
      'Dismiss report',
      'Resolve appeal',
      'Dismiss appeal',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('Other')).toBeNull()
  })
})

function renderPanel(
  transparency: ModerationTransparency | null | undefined,
  isLoading = false,
  uiLocale = 'en-US',
) {
  return render(
    <UiLocaleProvider uiLocale={uiLocale}>
      <ModerationTransparencyPanel
        transparency={transparency}
        isLoading={isLoading}
      />
    </UiLocaleProvider>,
  )
}

function makeTransparency(): ModerationTransparency {
  return {
    range: '30d',
    buckets: [
      {
        date: '2026-01-01',
        metric: 'automated_moderation',
        category: 'community_ai',
        count: 25,
      },
    ],
  }
}

function moderationActionBuckets(): ModerationTransparency['buckets'] {
  return [
    'remove',
    'approve',
    'reject',
    'ban',
    'lift_ban',
    'activate_restriction',
    'lift_restriction',
    'warn',
    'lock',
    'unlock',
    'pin',
    'unpin',
    'suspend',
    'unsuspend',
    'remove_member',
    'change_role',
    'resolve_report',
    'dismiss_report',
    'resolve_appeal',
    'dismiss_appeal',
  ].map((category, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    metric: 'moderation_actions',
    category,
    count: 25,
  }))
}
