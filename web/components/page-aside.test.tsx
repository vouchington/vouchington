import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageAside } from './page-aside'

describe('PageAside', () => {
  it('renders children', () => {
    render(
      <PageAside>
        <div data-testid='custom-aside'>Custom aside content</div>
      </PageAside>,
    )

    expect(screen.getByTestId('custom-aside')).toBeDefined()
    expect(screen.getByText('Custom aside content')).toBeDefined()
  })

  it('renders with showFooter prop without error (prop accepted but has no effect)', () => {
    render(
      <PageAside showFooter>
        <div data-testid='content'>Content</div>
      </PageAside>,
    )

    expect(screen.getByTestId('content')).toBeDefined()
  })

  it('renders nothing when no children', () => {
    const { container } = render(<PageAside />)
    expect(container.firstChild).toBeNull()
  })
})
