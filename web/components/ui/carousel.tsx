/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

import * as React from 'react'
import useEmblaCarousel from 'embla-carousel-react'

import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n/use-translations'
import { InternalCarouselNext, InternalCarouselPrevious } from './carousel/controls'
import { InternalCarouselContent, InternalCarouselItem } from './carousel/layout'

import { CarouselContext, type CarouselApi, type CarouselProps } from './carousel/context'
export { useCarousel, type CarouselApi } from './carousel/context'

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

export { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext }
