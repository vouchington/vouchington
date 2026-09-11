/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

import * as React from 'react'
import { use } from 'react'
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react'

import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n/use-translations'
import { InternalCarouselNext, InternalCarouselPrevious } from './carousel/controls'
import { InternalCarouselContent, InternalCarouselItem } from './carousel/layout'

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

interface CarouselProps {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  orientation?: 'horizontal' | 'vertical'
  setApi?: (api: CarouselApi) => void
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
} & CarouselProps

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

export function useCarousel() {
  const context = use(CarouselContext)

  if (!context) {
    throw new Error('useCarousel must be used within a <Carousel />')
  }

  return context
}

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- carousel containers need explicit group semantics with aria-roledescription. */
function Carousel({
  orientation = 'horizontal',
  opts,
  setApi,
  plugins,
  className,
  children,
  'aria-label': ariaLabel,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & CarouselProps & { ref?: React.Ref<HTMLDivElement> }) {
  const t = useTranslations()
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === 'horizontal' ? 'x' : 'y',
    },
    plugins,
  )
  const [canScrollPrev, setCanScrollPrev] = React.useState(false)
  const [canScrollNext, setCanScrollNext] = React.useState(false)

  const onSelect = React.useCallback((embla: CarouselApi) => {
    if (!embla) {
      return
    }

    setCanScrollPrev(embla.canScrollPrev())
    setCanScrollNext(embla.canScrollNext())
  }, [])

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev()
  }, [api])

  const scrollNext = React.useCallback(() => {
    api?.scrollNext()
  }, [api])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }
    if (orientation === 'vertical') {
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        scrollPrev()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        scrollNext()
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      scrollPrev()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      scrollNext()
    }
  }

  React.useEffect(() => {
    if (!api || !setApi) {
      return
    }

    queueMicrotask(() => setApi(api))
  }, [api, setApi])

  React.useEffect(() => {
    if (!api) {
      return
    }

    queueMicrotask(() => onSelect(api))
    api.on('reInit', onSelect)
    api.on('select', onSelect)

    return () => {
      api?.off('reInit', onSelect)
      api?.off('select', onSelect)
    }
  }, [api, onSelect])

  const contextValue = React.useMemo(
    () => ({
      carouselRef,
      api: api,
      opts,
      orientation,
      scrollPrev,
      scrollNext,
      canScrollPrev,
      canScrollNext,
    }),
    [api, canScrollNext, canScrollPrev, carouselRef, opts, orientation, scrollNext, scrollPrev],
  )

  return (
    <CarouselContext.Provider value={contextValue}>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- bubble-phase handling lets interactive slide descendants stop propagation first. */}
      <div
        ref={ref}
        aria-label={ariaLabel}
        aria-roledescription={t('extracted.ui.carousel.carousel_7565e448')}
        onKeyDown={handleKeyDown}
        className={cn('relative', className)}
        role='group'
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  )
}
/* oxlint-enable jsx-a11y/prefer-tag-over-role */
Carousel.displayName = 'Carousel'

const CarouselContent = InternalCarouselContent
const CarouselItem = InternalCarouselItem
const CarouselPrevious = InternalCarouselPrevious
const CarouselNext = InternalCarouselNext

export { type CarouselApi, Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext }
