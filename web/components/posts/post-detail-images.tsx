'use client'
import { useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { ImageButton } from './post-detail-image-button'
import { ExposureGatedPostImages } from './post-detail-images-exposure-gate'
import { useTranslations } from '@/lib/i18n/use-translations'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const PostImageLightbox = dynamic(() =>
  import('./post-image-lightbox').then(mod => mod.PostImageLightbox),
)

interface PostDetailImagesProps {
  heading: string
  postId: string
  images: PostDetailImageViewModel[]
  thumbnails?: ReactNode[]
  /** True when the current viewer is an administrator or community moderator. */
  isModerator?: boolean
  /**
   * True when this post is flagged by OpenAI moderation — images should be blurred
   * for moderators until explicitly revealed.
   */
  isSensitive?: boolean
}

interface PostDetailImageViewModel {
  imageId: string
  placementId: string
  placementRevision: number
  caption: string
}

export function PostDetailImages({
  heading,
  postId,
  images,
  thumbnails,
  isModerator = false,
  isSensitive = false,
}: PostDetailImagesProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const showBlurGate = isModerator && isSensitive

  if (!images?.length) return null
  const gallery =
    images.length === 1 ? (
      <SinglePostImage
        heading={heading}
        image={images[0]!}
        thumbnail={thumbnails?.[0]}
        setLightboxIndex={setLightboxIndex}
        setLightboxOpen={setLightboxOpen}
      />
    ) : (
      <Carousel className='w-full'>
        <CarouselContent>
          {images.map((img, index) => (
            <CarouselItem key={img.imageId}>
              <PostCarouselImage
                heading={heading}
                image={img}
                thumbnail={thumbnails?.[index]}
                imageCount={images.length}
                index={index}
                setLightboxIndex={setLightboxIndex}
                setLightboxOpen={setLightboxOpen}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className='left-2' />
        <CarouselNext className='right-2' />
      </Carousel>
    )

  return (
    <>
      {showBlurGate ? (
        <ExposureGatedPostImages postId={postId}>{gallery}</ExposureGatedPostImages>
      ) : (
        gallery
      )}
      <PostImageLightbox
        images={images}
        startIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        alt={heading}
      />
    </>
  )
}

function SinglePostImage({
  heading,
  image,
  thumbnail,
  setLightboxIndex,
  setLightboxOpen,
}: {
  heading: string
  image: PostDetailImageViewModel
  thumbnail?: ReactNode
  setLightboxIndex: (index: number) => void
  setLightboxOpen: (open: boolean) => void
}) {
  return (
    <div className='flex flex-col gap-2'>
      <ImageButton
        alt={image.caption || heading}
        imageId={image.imageId}
        placement={{ id: image.placementId, revision: image.placementRevision }}
        onClick={() => {
          setLightboxIndex(0)
          setLightboxOpen(true)
        }}
        priority
      >
        {thumbnail}
      </ImageButton>
      {image.caption && (
        <p className='text-center text-sm text-muted-foreground'>{image.caption}</p>
      )}
    </div>
  )
}

function PostCarouselImage({
  heading,
  image,
  thumbnail,
  imageCount,
  index,
  setLightboxIndex,
  setLightboxOpen,
}: {
  heading: string
  image: PostDetailImageViewModel
  thumbnail?: ReactNode
  imageCount: number
  index: number
  setLightboxIndex: (index: number) => void
  setLightboxOpen: (open: boolean) => void
}) {
  const t = useTranslations()
  return (
    <div className='flex flex-col gap-2'>
      <ImageButton
        alt={image.caption || heading}
        imageId={image.imageId}
        placement={{ id: image.placementId, revision: image.placementRevision }}
        onClick={() => {
          setLightboxIndex(index)
          setLightboxOpen(true)
        }}
        priority={index === 0}
        ariaLabel={
          image.caption
            ? t('extracted.posts.postDetailImages.viewFullSizeCaption_cbf4cc3c', {
                caption: image.caption,
              })
            : t('extracted.posts.postDetailImages.viewFullSizeImageIndexOf_af51c711', {
                index: index + 1,
                count: imageCount,
              })
        }
      >
        {thumbnail}
      </ImageButton>
      {image.caption && (
        <p className='text-center text-sm text-muted-foreground'>{image.caption}</p>
      )}
    </div>
  )
}
