import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

describe('ScrollArea', () => {
  it('makes the viewport keyboard-focusable with a visible inset focus ring', () => {
    render(<ScrollArea>Content</ScrollArea>)

    const viewport = screen.getByText('Content').closest('[class~="rounded-[inherit]"]')
    expect(viewport).toBeInTheDocument()
    expect(viewport).toHaveAttribute('tabindex', '0')
    expect(viewport).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:ring-1',
      'focus-visible:ring-inset',
      'focus-visible:ring-ring',
    )
  })

  it('styles an explicitly nested horizontal scrollbar', () => {
    const { container } = render(
      <ScrollArea type='always'>
        Content
        <ScrollBar orientation='horizontal' />
      </ScrollArea>,
    )

    const scrollbar = container.querySelector('[class~="h-2.5"]')
    expect(scrollbar).toBeInTheDocument()
    expect(scrollbar).toHaveClass(
      'h-2.5',
      'flex-col',
      'border-t',
      'border-t-transparent',
      'p-[1px]',
    )
  })
})
