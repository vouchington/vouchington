'use client'

import * as React from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useCarousel } from '../carousel'
import { useTranslations } from '@/lib/i18n/use-translations'

function CarouselPrevious({
  className,
  variant = 'outline',
  size = 'icon',
  ref,
  ...props
}: React.ComponentProps<typeof Button> & { ref?: React.Ref<HTMLButtonElement> }) {
  const t = useTranslations()
  const { orientation, scrollPrev, canScrollPrev } = useCarousel()

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        'absolute  h-8 w-8 rounded-full',
        orientation === 'horizontal'
          ? '-left-12 top-1/2 -translate-y-1/2'
          : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      data-pw='carousel-previous'
      {...props}
    >
      <ArrowLeft className='h-4 w-4' />
      <span className='sr-only'>{t('extracted.carousel.controls.previousSlide_bfb54922')}</span>
    </Button>
  )
}
CarouselPrevious.displayName = 'CarouselPrevious'

function CarouselNext({
  className,
  variant = 'outline',
  size = 'icon',
  ref,
  ...props
}: React.ComponentProps<typeof Button> & { ref?: React.Ref<HTMLButtonElement> }) {
  const t = useTranslations()
  const { orientation, scrollNext, canScrollNext } = useCarousel()

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        'absolute h-8 w-8 rounded-full',
        orientation === 'horizontal'
          ? '-right-12 top-1/2 -translate-y-1/2'
          : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      data-pw='carousel-next'
      {...props}
    >
      <ArrowRight className='h-4 w-4' />
      <span className='sr-only'>{t('extracted.carousel.controls.nextSlide_cdc93d1c')}</span>
    </Button>
  )
}
CarouselNext.displayName = 'CarouselNext'

export { CarouselPrevious as InternalCarouselPrevious, CarouselNext as InternalCarouselNext }
