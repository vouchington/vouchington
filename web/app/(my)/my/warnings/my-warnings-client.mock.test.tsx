import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MyWarningsClient } from './my-warnings-client'
import type { MyWarningViewModel } from './my-warnings-view-model'

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <time data-testid='time-ago'>{date}</time>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

const emptyWarnings: MyWarningViewModel[] = []

const warning: MyWarningViewModel = {
  id: 'warning-1',
  publicMessage: 'Please stop spamming.',
  createdAt: '2026-05-31T00:00:00.000Z',
  communitySlug: null,
}

describe('MyWarningsClient', () => {
  it('shows empty state when there are no warnings', () => {
    render(<MyWarningsClient warnings={emptyWarnings} />)

    expect(screen.getByText('You have no warnings on your account.')).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders a list of warnings when warnings exist', () => {
    render(<MyWarningsClient warnings={[warning]} />)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('Please stop spamming.')).toBeVisible()
  })

  it('shows site-wide warning label when community_slug is null', () => {
    render(<MyWarningsClient warnings={[warning]} />)

    expect(screen.getByText('Site-wide warning')).toBeVisible()
  })

  it('shows community link when community_slug is set', () => {
    render(<MyWarningsClient warnings={[{ ...warning, communitySlug: 'credit-cards' }]} />)

    const link = screen.getByRole('link', { name: 'credit-cards' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/communities/credit-cards')
  })

  it('shows no-message placeholder when public_message is null', () => {
    render(<MyWarningsClient warnings={[{ ...warning, publicMessage: null }]} />)

    expect(screen.getByText('No additional message was provided.')).toBeVisible()
  })
})
