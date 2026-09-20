'use client'

import { SensitiveMedia } from '@/components/moderation/sensitive-media'
import { PostImage } from '@/components/shared/post-image'
import type { AdminReviewQueuePost } from '@/types/admin-review-queue'

interface ReviewQueueMediaProps {
  postId: string
  mediaReveal: AdminReviewQueuePost['media_reveal']
  onReveal: (postId: string) => void
  revealDisabled: boolean
}

export function ReviewQueueMedia({
  postId,
  mediaReveal,
  onReveal,
  revealDisabled,
}: ReviewQueueMediaProps) {
  if (mediaReveal.images.length === 0) return null

  const images = (
    <div
      className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4'
      data-pw='review-queue-media'
    >
      {mediaReveal.images.map(image => (
        <PostImage
          key={image.image_id}
          imageId={image.image_id}
          placement={{ id: image.placement_id, revision: image.placement_revision }}
          width={240}
          height={160}
          alt={image.caption}
          className='h-24 w-full rounded object-cover'
        />
      ))}
    </div>
  )

  return mediaReveal.requires_reveal ? (
    <SensitiveMedia
      disabled={revealDisabled}
      onReveal={() => onReveal(postId)}
    >
      {images}
    </SensitiveMedia>
  ) : (
    images
  )
}
