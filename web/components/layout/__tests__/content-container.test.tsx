import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ContentContainer } from '../content-container'

describe('ContentContainer', () => {
  it('renders a div with centering and max-width classes', () => {
    const { container } = render(<ContentContainer />)
    const el = container.firstElementChild
    expect(el?.tagName).toBe('DIV')
    expect(el?.className).toContain('mx-auto')
    expect(el?.className).toContain('w-full')
    expect(el?.className).toContain('max-w-[1200px]')
  })

  it('merges additional className via cn', () => {
    const { container } = render(<ContentContainer className='flex items-center' />)
    const el = container.firstElementChild
    expect(el?.className).toContain('mx-auto')
    expect(el?.className).toContain('flex')
    expect(el?.className).toContain('items-center')
  })

  it('does not include px-4 (outer element owns the gutter)', () => {
    const { container } = render(<ContentContainer />)
    const el = container.firstElementChild
    // The gutter lives on the outer element (nav, main, footer) so the container
    // never double-pads when placed inside a px-4 parent.
    expect(el?.className).not.toContain('px-4')
  })

  it('forwards additional HTML props to the div', () => {
    const { container } = render(
      <ContentContainer
        data-testid='my-container'
        aria-label='Content'
      />,
    )
    const el = container.firstElementChild
    expect(el?.getAttribute('data-testid')).toBe('my-container')
    expect(el?.getAttribute('aria-label')).toBe('Content')
  })

  it('renders children', () => {
    const { getByText } = render(<ContentContainer>Hello world</ContentContainer>)
    expect(getByText('Hello world')).toBeDefined()
  })

  it('has data-pw content-container', () => {
    const { container } = render(<ContentContainer />)
    expect(container.firstElementChild?.getAttribute('data-pw')).toBe('content-container')
  })
})
