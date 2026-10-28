import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScrollArea } from '@/components/ui/scroll-area'

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
})
