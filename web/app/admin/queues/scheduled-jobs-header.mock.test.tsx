import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
      }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
      }) => (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(import('lucide-react'), () => mockLucideReact({ Loader2: () => <span>loading</span> }))

import { ScheduledJobsHeader } from './scheduled-jobs-header'

describe('ScheduledJobsHeader', () => {
  it('renders the queues heading through the shared admin page header', () => {
    render(
      <ScheduledJobsHeader
        loading={false}
        onRefresh={vi.fn<() => void>()}
      />,
    )
    const heading = screen.getByRole('heading', { level: 1, name: 'Queues' })
    expect(heading).toHaveClass('text-xl', 'font-semibold', 'sm:text-2xl')
    expect(heading).not.toHaveClass('font-bold')
    expect(screen.getByText('glide-mq job queue management')).toHaveClass(
      'mt-1',
      'text-sm',
      'text-muted-foreground',
    )
    expect(heading.parentElement?.parentElement).toHaveClass('flex-col', 'gap-3', 'sm:flex-row')
    expect(screen.getByText('Open GlideMQ Dashboard')).toBeDefined()
  })

  it('renders the refresh button in loading state', () => {
    render(
      <ScheduledJobsHeader
        loading
        onRefresh={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByText('Refreshing...')).toBeDefined()
  })
})
