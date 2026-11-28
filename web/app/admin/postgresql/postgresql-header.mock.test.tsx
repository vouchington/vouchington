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

import { PostgreSQLHeader } from './postgresql-header'

describe('PostgreSQLHeader', () => {
  it('renders the postgresql heading through the shared admin page header', () => {
    render(
      <PostgreSQLHeader
        loadData={vi.fn<() => void>()}
        loading={false}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'PostgreSQL' })).toBeInTheDocument()
    expect(screen.getByText('Database migrations and management')).toBeInTheDocument()
  })

  it('renders the refresh button in loading state', () => {
    render(
      <PostgreSQLHeader
        loadData={vi.fn<() => void>()}
        loading
      />,
    )
    expect(screen.getByText('Refreshing...')).toBeInTheDocument()
  })
})
