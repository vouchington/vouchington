/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'
import { PostImage } from '@/components/shared/post-image'

interface LightboxImage {
  imageId: string
  placementId: string
  placementRevision: number
  caption: string
}

interface PostImageLightboxProps {
  images: LightboxImage[]
  startIndex: number
  open: boolean
  onOpenChange: (open: boolean) => void
  alt: string
}

export function PostImageLightbox({
  images,
  startIndex,
  open,
  onOpenChange,
  alt,
}: PostImageLightboxProps) {
  const [api, setApi] = useState<CarouselApi>()

  useEffect(() => {
    if (api && open) {
      api.scrollTo(startIndex, true)
    }
  }, [api, open, startIndex])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className='max-w-[95vw] border-0 bg-black/95 p-4 sm:max-w-[95vw] [&>button]:text-white'>
        <DialogHeader className='sr-only'>
          <DialogTitle>{alt}</DialogTitle>
          <DialogDescription>
            {images.length === 1 ? 'View full-size post image.' : 'View full-size post images.'}
          </DialogDescription>
        </DialogHeader>
        {images.length === 1 ? (
          <div className='flex flex-col items-center gap-2'>
            <PostImage
              imageId={images[0]!.imageId}
              placement={{
                id: images[0]!.placementId,
                revision: images[0]!.placementRevision,
              }}
              width={1600}
              height={1600}
              alt={images[0]!.caption || alt}
              className='max-h-[85vh] w-auto rounded-md object-contain'
            />
            {images[0]!.caption && (
              <p className='text-center text-sm text-white/70'>{images[0]!.caption}</p>
            )}
          </div>
        ) : (
          <Carousel
            className='w-full'
            setApi={setApi}
          >
            <CarouselContent>
              {images.map((img, index) => (
                <CarouselItem key={img.imageId}>
                  <div className='flex flex-col items-center gap-2'>
                    <PostImage
                      imageId={img.imageId}
                      placement={{ id: img.placementId, revision: img.placementRevision }}
                      width={1600}
                      height={1600}
                      alt={img.caption || alt}
                      className='max-h-[85vh] w-auto rounded-md object-contain'
                      priority={index === startIndex}
                    />
                    {img.caption && (
                      <p className='text-center text-sm text-white/70'>{img.caption}</p>
                    )}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className='left-2 border-white/20 bg-black/60 text-white hover:bg-black/80 hover:text-white' />
            <CarouselNext className='right-2 border-white/20 bg-black/60 text-white hover:bg-black/80 hover:text-white' />
          </Carousel>
        )}
      </DialogContent>
    </Dialog>
  )
}
