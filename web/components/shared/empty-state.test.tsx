import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('renders default text with data-pw', () => {
    const { container } = render(<EmptyState />)
    expect(container.querySelector('[data-pw="empty-state"]')).not.toBeNull()
    const icon = container.querySelector('svg')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  it('renders optional action', () => {
    render(
      <EmptyState>
        <button type='button'>Create</button>
      </EmptyState>,
    )
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('allows callers to override container spacing', () => {
    const { container } = render(<EmptyState className='p-4' />)

    expect(container.querySelector('[data-pw="empty-state"]')).toHaveClass('p-4')
  })
})
