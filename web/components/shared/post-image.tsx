import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { getImageUrl, getPlacementImageUrl } from '@/lib/utils/image-url'

interface ImagePlacement {
  id: string
  revision: number
}

interface PostImageProps {
  imageId: string
  width: number
  height?: number
  alt?: string
  className?: string
  priority?: boolean
  /** Both placement identity and revision are required for bound post media. */
  placement?: ImagePlacement
}

export function PostImage({
  imageId,
  width,
  height,
  alt = '',
  className,
  priority,
  placement,
}: PostImageProps) {
  const intrinsicHeight = height ?? width

  return (
    <Image
      data-pw='post-image'
      src={
        placement
          ? getPlacementImageUrl(placement.id, placement.revision, imageId, { width })
          : getImageUrl(imageId, { width })
      }
      alt={alt}
      unoptimized
      className={className}
      width={width}
      height={intrinsicHeight}
      priority={priority}
    />
  )
}
