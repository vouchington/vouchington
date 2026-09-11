import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SequentialAsideSuspense } from './sequential-aside-suspense'

describe('SequentialAsideSuspense', () => {
  it('returns null for empty children', () => {
    const { container } = render(<SequentialAsideSuspense>{[]}</SequentialAsideSuspense>)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders synchronous children immediately', () => {
    render(
      <SequentialAsideSuspense>
        <div data-testid='aside-1'>First</div>
        <div data-testid='aside-2'>Second</div>
      </SequentialAsideSuspense>,
    )
    expect(screen.getByTestId('aside-1')).toBeDefined()
    expect(screen.getByTestId('aside-2')).toBeDefined()
  })

  it('renders a single child without error', () => {
    render(
      <SequentialAsideSuspense>
        <div data-testid='single'>Only child</div>
      </SequentialAsideSuspense>,
    )
    expect(screen.getByTestId('single')).toBeDefined()
  })

  it('filters out falsy children', () => {
    const showHidden = false as boolean
    render(
      <SequentialAsideSuspense>
        <div data-testid='visible'>Visible</div>
        {showHidden && <div data-testid='hidden'>Hidden</div>}
      </SequentialAsideSuspense>,
    )
    expect(screen.getByTestId('visible')).toBeDefined()
    expect(screen.queryByTestId('hidden')).toBeNull()
  })
})
