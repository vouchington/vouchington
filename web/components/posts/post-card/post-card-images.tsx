import Link from 'next/link'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { PostImage } from '@/components/shared/post-image'
import { humanizePostType } from '@ts-shared/utils/format'
import type { Post } from '@/types/posts'

export function PostCardImages({
  post,
  routePath,
  view,
  priority,
}: {
  post: Post
  routePath: string
  view: 'card' | 'compact'
  priority?: boolean
}) {
  const images = post.images ?? []
  const firstImage = images[0]
  if (view === 'compact' && firstImage) {
    return (
      <Link
        href={`/${routePath}/${post.id}`}
        prefetch={false}
      >
        <PostImage
          imageId={firstImage.image_id}
          placement={{ id: firstImage.placement_id, revision: firstImage.placement_revision }}
          width={200}
          alt={firstImage.caption || post.title || `Untitled ${humanizePostType(post.post_type)}`}
          className='h-20 w-20 flex-shrink-0 rounded-md object-cover'
        />
      </Link>
    )
  }
  if (view !== 'card' || images.length === 0) return null
  if (images.length === 1 && firstImage) {
    return (
      <div>
        <PostImage
          imageId={firstImage.image_id}
          placement={{ id: firstImage.placement_id, revision: firstImage.placement_revision }}
          width={800}
          alt={
            firstImage.caption ? '' : post.title || `Untitled ${humanizePostType(post.post_type)}`
          }
          className='w-full rounded-md object-cover'
          height={240}
          priority={priority}
        />
        {firstImage.caption ? (
          <p className='mt-1 text-center text-xs text-muted-foreground'>{firstImage.caption}</p>
        ) : null}
      </div>
    )
  }
  return (
    <Carousel className='w-full'>
      <CarouselContent>
        {images.map((image, index) => (
          <CarouselItem key={image.image_id}>
            <PostImage
              imageId={image.image_id}
              placement={{ id: image.placement_id, revision: image.placement_revision }}
              width={800}
              alt={
                image.caption ? '' : post.title || `Untitled ${humanizePostType(post.post_type)}`
              }
              className='w-full rounded-md object-cover'
              height={240}
              priority={priority && index === 0}
            />
            {image.caption ? (
              <p className='mt-1 text-center text-xs text-muted-foreground'>{image.caption}</p>
            ) : null}
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className='left-2' />
      <CarouselNext className='right-2' />
    </Carousel>
  )
}
