import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScrollArea } from '@/components/ui/scroll-area'

describe('ScrollArea', () => {
  it('makes the viewport keyboard-focusable', () => {
    render(<ScrollArea>Content</ScrollArea>)

    const viewport = screen.getByText('Content').closest('[data-radix-scroll-area-viewport]')
    expect(viewport).toBeInTheDocument()
    expect(viewport).toHaveAttribute('tabindex', '0')
  })
})
