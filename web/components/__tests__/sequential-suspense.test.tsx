import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SequentialSuspense } from '../sequential-suspense'

describe('SequentialSuspense', () => {
  it('returns null for empty children', () => {
    const { container } = render(<SequentialSuspense>{[]}</SequentialSuspense>)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders synchronous children immediately', () => {
    render(
      <SequentialSuspense>
        <div data-testid='child-1'>First</div>
        <div data-testid='child-2'>Second</div>
      </SequentialSuspense>,
    )
    expect(screen.getByTestId('child-1')).toBeDefined()
    expect(screen.getByTestId('child-2')).toBeDefined()
  })

  it('renders a single child without error', () => {
    render(
      <SequentialSuspense>
        <div data-testid='single'>Only child</div>
      </SequentialSuspense>,
    )
    expect(screen.getByTestId('single')).toBeDefined()
  })

  it('handles falsy/conditional children', () => {
    const showHidden = false as boolean
    render(
      <SequentialSuspense>
        <div data-testid='visible'>Visible</div>
        {showHidden && <div data-testid='hidden'>Hidden</div>}
      </SequentialSuspense>,
    )
    expect(screen.getByTestId('visible')).toBeDefined()
    expect(screen.queryByTestId('hidden')).toBeNull()
  })

  it('uses default null fallback when fallback prop is omitted', () => {
    const { container } = render(<SequentialSuspense>{[]}</SequentialSuspense>)
    expect(container).toBeEmptyDOMElement()
  })

  it('uses custom fallback when provided', () => {
    render(
      <SequentialSuspense fallback={<div data-testid='custom-fallback'>Loading…</div>}>
        <div data-testid='content'>Content</div>
      </SequentialSuspense>,
    )
    // When children are synchronous, content renders and fallback is not shown
    expect(screen.getByTestId('content')).toBeDefined()
    expect(screen.queryByTestId('custom-fallback')).toBeNull()
  })
})
