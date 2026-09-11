import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { ModerationTransparencyPanel } from '@/components/moderation/moderation-transparency-panel'
import type { ModerationTransparency } from '@/types/moderation-analytics'
import { ApiError } from '@/lib/api/error'

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

    expect(screen.getByRole('heading', { name: 'Moderation Transparency' })).toBeDefined()
    expect(screen.getByText('Automated moderation')).toBeDefined()
    expect(screen.getByText('Community AI')).toBeDefined()
    expect(screen.getByText('25')).toBeDefined()
    expect(screen.getByText('Jan 1, 2026')).toBeDefined()

    const table = screen.getByRole('table', { name: 'Moderation Transparency' })
    expect(table.querySelector('caption')).toHaveTextContent('Moderation Transparency')
    expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(4)
  })

  it('renders a loading state before aggregate data is available', () => {
    renderPanel(undefined, true)

    expect(screen.getByText('Loading moderation transparency…')).toBeDefined()
    expect(screen.getByText('Loading moderation transparency…')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('formats bucket dates with the resolved UI locale', () => {
    renderPanel(makeTransparency(), false, 'en-GB')

    expect(screen.getByText('1 Jan 2026')).toBeDefined()
  })

  it('renders all-time buckets by locale-aware month and year with a period heading', () => {
    renderPanel({ ...makeTransparency(), range: 'all' }, false, 'en-GB')

    expect(screen.getByText('Jan 2026')).toBeDefined()
    expect(screen.getByRole('columnheader', { name: 'Period:' })).toBeDefined()
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

    await vi.waitFor(() =>
      expect(fetchModerationTransparencyMock).toHaveBeenCalledWith({
        range: 'all',
        after: 'older',
      }),
    )
    await vi.waitFor(() => expect(screen.getByText('30')).toBeDefined())
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('replaces paid rows when an all-time continuation loses access', async () => {
    fetchModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))
    renderPanel({ ...makeTransparency(), range: 'all', next_cursor: 'older' })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await vi.waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'Moderation transparency is available with Plus or Pro.',
        }),
      ).toBeDefined(),
    )
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

    expect(screen.getByText('OpenAI moderation')).toBeDefined()
    expect(screen.getByText('Agent moderation')).toBeDefined()
    expect(screen.getByText('Post clearance rejection')).toBeDefined()
    expect(screen.getByText('Spam detection')).toBeDefined()
  })

  it('renders the privacy-suppressed empty state without rows', () => {
    renderPanel({ range: '30d', buckets: [] })

    expect(screen.getByText('No aggregate data is available for this period.')).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders the paid upgrade state for a forbidden response', () => {
    renderPanel(null)

    expect(
      screen.getByRole('heading', {
        name: 'Moderation transparency is available with Plus or Pro.',
      }),
    ).toBeDefined()
    expect(screen.getByRole('link', { name: 'View plans' }).getAttribute('href')).toBe('/plans')
  })

  it('clears released rows when a downgrade or identity change removes access', () => {
    const view = renderPanel(makeTransparency())
    expect(screen.getByText('25')).toBeDefined()

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
    ).toBeDefined()
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

    expect(screen.getByText('Other')).toBeDefined()
    expect(screen.queryByText('Internal only category')).toBeNull()
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto')
    expect(screen.getByRole('table').parentElement).not.toHaveClass('overflow-hidden')
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

    expect(screen.getByText('Other')).toBeDefined()
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
      'Tag',
      'Suspend',
      'Unsuspend',
      'Remove member',
      'Change role',
      'Resolve report',
      'Dismiss report',
      'Resolve appeal',
      'Dismiss appeal',
    ]) {
      expect(screen.getByText(label)).toBeDefined()
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
    'tag',
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
