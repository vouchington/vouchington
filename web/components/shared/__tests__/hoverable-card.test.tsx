import Link from 'next/link'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HoverableCard } from '../hoverable-card'

describe('HoverableCard', () => {
  it('renders a div', () => {
    const { container } = render(<HoverableCard>Card content</HoverableCard>)
    const card = container.firstElementChild

    expect(card?.tagName).toBe('DIV')
  })

  it('forwards HTML props, children, and data-pw', () => {
    const { container } = render(
      <HoverableCard
        aria-label='Featured card'
        data-pw='hoverable-card'
      >
        Featured
      </HoverableCard>,
    )
    const card = container.firstElementChild

    expect(screen.getByText('Featured')).toBeInTheDocument()
    expect(card?.getAttribute('aria-label')).toBe('Featured card')
    expect(card?.getAttribute('data-pw')).toBe('hoverable-card')
  })

  it('can render onto a child element', () => {
    render(
      <HoverableCard asChild>
        <Link href='/topics'>Topics</Link>
      </HoverableCard>,
    )

    const link = screen.getByRole('link', { name: 'Topics' })
    expect(link.getAttribute('href')).toBe('/topics')
  })

  it('forwards refs to the rendered element', () => {
    const ref = createRef<HTMLDivElement>()

    render(<HoverableCard ref={ref}>Focusable card</HoverableCard>)

    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    expect(ref.current?.textContent).toBe('Focusable card')
  })
})
