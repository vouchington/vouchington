import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HoverableCard } from '../hoverable-card'

describe('HoverableCard', () => {
  it('renders a div with the shared hoverable card shell classes', () => {
    const { container } = render(<HoverableCard>Card content</HoverableCard>)
    const card = container.firstElementChild

    expect(card?.tagName).toBe('DIV')
    expect(card?.className).toContain('rounded-md')
    expect(card?.className).toContain('border')
    expect(card?.className).toContain('bg-card')
    expect(card?.className).toContain('p-4')
    expect(card?.className).toContain('text-card-foreground')
    expect(card?.className).toContain('shadow-sm')
    expect(card?.className).toContain('transition-shadow')
    expect(card?.className).toContain('hover:shadow-md')
    expect(card?.className).toContain('dark:shadow-none')
    expect(card?.className).toContain('dark:hover:shadow-none')
    expect(card?.className).toContain('dark:hover:border-accent-foreground/20')
  })

  it('merges additional classes and allows spacing overrides', () => {
    const { container } = render(
      <HoverableCard className='flex items-center p-0'>Compact card</HoverableCard>,
    )
    const card = container.firstElementChild

    expect(card?.className).toContain('flex')
    expect(card?.className).toContain('items-center')
    expect(card?.className).toContain('p-0')
    expect(card?.className).not.toContain('p-4')
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

    expect(screen.getByText('Featured')).toBeDefined()
    expect(card?.getAttribute('aria-label')).toBe('Featured card')
    expect(card?.getAttribute('data-pw')).toBe('hoverable-card')
  })

  it('can render the shell classes onto a child element', () => {
    render(
      <HoverableCard
        asChild
        className='block'
      >
        <a href='/topics'>Topics</a>
      </HoverableCard>,
    )

    const link = screen.getByRole('link', { name: 'Topics' })
    expect(link.getAttribute('href')).toBe('/topics')
    expect(link.className).toContain('block')
    expect(link.className).toContain('hover:shadow-md')
  })

  it('forwards refs to the rendered element', () => {
    const ref = createRef<HTMLDivElement>()

    render(<HoverableCard ref={ref}>Focusable card</HoverableCard>)

    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    expect(ref.current?.textContent).toBe('Focusable card')
  })
})
