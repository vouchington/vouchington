import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { InternalCarouselNext, InternalCarouselPrevious } from './controls'

const mockScrollPrev = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockScrollNext = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('../carousel'),
  () =>
    ({
      useCarousel: () => ({
        orientation: 'horizontal' as const,
        scrollPrev: mockScrollPrev,
        scrollNext: mockScrollNext,
        canScrollPrev: true,
        canScrollNext: true,
      }),
    }) as unknown as typeof import('../carousel'),
)

describe('InternalCarouselPrevious', () => {
  it('renders a previous-slide button', () => {
    render(<InternalCarouselPrevious />)
    expect(screen.getByRole('button', { name: 'Previous slide' })).toBeInTheDocument()
  })
})

describe('InternalCarouselNext', () => {
  it('renders a next-slide button', () => {
    render(<InternalCarouselNext />)
    expect(screen.getByRole('button', { name: 'Next slide' })).toBeInTheDocument()
  })
})
