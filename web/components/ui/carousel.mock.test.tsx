import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from './carousel'

const mockScrollPrev = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockScrollNext = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockEmblaOn = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockEmblaOff = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockUseEmblaCarousel = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('embla-carousel-react'),
  () =>
    ({
      default: mockUseEmblaCarousel,
    }) as unknown as typeof import('embla-carousel-react'),
)

describe('Carousel', () => {
  beforeEach(() => {
    mockScrollPrev.mockReset()
    mockScrollNext.mockReset()
    mockEmblaOn.mockReset()
    mockEmblaOff.mockReset()

    mockUseEmblaCarousel.mockReturnValue([
      vi.fn<VitestLooseMock>(),
      {
        canScrollPrev: () => true,
        canScrollNext: () => true,
        scrollPrev: mockScrollPrev,
        scrollNext: mockScrollNext,
        on: mockEmblaOn,
        off: mockEmblaOff,
      },
    ])
  })

  it('does not add tabIndex to the carousel region and still handles bubbled arrow keys', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    )

    const region = container.querySelector('[aria-roledescription="carousel"]')
    expect(region).not.toBeNull()
    expect(region).not.toHaveAttribute('tabindex')

    fireEvent.keyDown(screen.getByRole('button', { name: 'Next slide' }), { key: 'ArrowRight' })
    expect(mockScrollNext).toHaveBeenCalledTimes(1)
  })
})
