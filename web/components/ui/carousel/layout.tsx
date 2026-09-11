'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useCarousel } from '../carousel'

function CarouselContent({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  const { carouselRef, orientation } = useCarousel()

  return (
    <div
      ref={carouselRef}
      className='overflow-hidden'
    >
      <div
        ref={ref}
        className={cn('flex', orientation === 'horizontal' ? '-ml-2' : '-mt-2 flex-col', className)}
        {...props}
      />
    </div>
  )
}
CarouselContent.displayName = 'CarouselContent'

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- carousel slides need explicit group semantics with aria-roledescription. */
function CarouselItem({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  const { orientation } = useCarousel()

  return (
    <div
      ref={ref}
      role='group'
      aria-roledescription='slide'
      className={cn(
        'min-w-0 shrink-0 grow-0 basis-full',
        orientation === 'horizontal' ? 'pl-2' : 'pt-2',
        className,
      )}
      {...props}
    />
  )
}
/* oxlint-enable jsx-a11y/prefer-tag-over-role */
CarouselItem.displayName = 'CarouselItem'

export { CarouselContent as InternalCarouselContent, CarouselItem as InternalCarouselItem }
