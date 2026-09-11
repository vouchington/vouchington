import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { InternalCarouselContent, InternalCarouselItem } from './layout'

vi.mock(
  import('../carousel'),
  () =>
    ({
      useCarousel: () => ({
        carouselRef: { current: null },
        orientation: 'horizontal' as const,
      }),
    }) as unknown as typeof import('../carousel'),
)

describe('InternalCarouselContent', () => {
  it('renders children inside a scroll container', () => {
    render(
      <InternalCarouselContent>
        <div>Slide</div>
      </InternalCarouselContent>,
    )
    expect(screen.getByText('Slide')).toBeInTheDocument()
  })
})

describe('InternalCarouselItem', () => {
  it('renders a slide group element', () => {
    render(<InternalCarouselItem>Item content</InternalCarouselItem>)
    const item = screen.getByRole('group')
    expect(item).toBeInTheDocument()
  })
})
